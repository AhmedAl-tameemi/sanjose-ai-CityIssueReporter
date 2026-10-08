import { and, asc, eq, gt, lt } from "drizzle-orm";
import { db, trafficReportsTable } from "@workspace/db";
import { generateReportAnalysis, ReportAnalysisProviderError } from "./reportAnalysis";
import { normalizeStoredEvidence } from "./reportEvidence";
import { isConciseReportSummary } from "./reportSummary";

let running: Promise<void> | null = null;
let lastAttemptAt = 0;
const cooldownMs = 5 * 60_000;
const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Upgrade older one-sentence analyses and recover missing summaries without
 * blocking report-history reads or changing any resident's original statement.
 */
export function ensureReportSummaries(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return Promise.resolve();
  if (running) return running;
  if (Date.now() - lastAttemptAt < cooldownMs) return Promise.resolve();
  lastAttemptAt = Date.now();
  running = backfill().finally(() => { running = null; });
  return running;
}

async function backfill(): Promise<void> {
  let lastId: string | undefined;
  // Give a new submission's inline analysis time to finish before recovery.
  const submittedBefore = new Date(Date.now() - 60_000);
  while (true) {
    const records = await db.select().from(trafficReportsTable)
      .where(and(
        lt(trafficReportsTable.submittedAt, submittedBefore),
        lastId ? gt(trafficReportsTable.id, lastId) : undefined,
      ))
      .orderBy(asc(trafficReportsTable.id)).limit(50);
    if (!records.length) return;
    for (const record of records) {
      lastId = record.id;
      if (record.analysisStatus === "complete" && isConciseReportSummary(record.analysis?.summary)) continue;
      await db.update(trafficReportsTable).set({ analysisStatus: "pending" })
        .where(eq(trafficReportsTable.id, record.id));
      let credentialsRejected = false;
      let analysis: Awaited<ReturnType<typeof generateReportAnalysis>> | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          analysis = await generateReportAnalysis(record.originalReport, normalizeStoredEvidence(record.evidence));
          break;
        } catch (error) {
          if (error instanceof ReportAnalysisProviderError && error.status >= 400 && error.status < 500 && error.status !== 429) {
            credentialsRejected = error.status === 401 || error.status === 403;
            break;
          }
          if (attempt < 2) await pause(5_000 * 2 ** attempt);
        }
      }
      await db.update(trafficReportsTable)
        .set(analysis ? { analysis, analysisStatus: "complete" } : { analysisStatus: "unavailable" })
        .where(eq(trafficReportsTable.id, record.id));
      // A bad key must not produce a provider request for every stored report.
      if (credentialsRejected) return;
      await pause(1_000);
    }
  }
}
