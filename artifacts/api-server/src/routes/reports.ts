import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateTrafficReportBody,
  CreateTrafficReportResponse,
  ListTrafficReportsQueryParams,
  ListTrafficReportsResponse,
} from "@workspace/api-zod";
import { db, trafficReportsTable, type TrafficReportRecord } from "@workspace/db";
import {
  canResidentPreviewEvidence,
  getResidentOwnerId,
} from "../lib/staffAuth";
import { generateReportAnalysis } from "../lib/reportAnalysis";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  canReadReportEvidence,
  canSubmitEvidence,
  normalizeStoredEvidence,
  reportEvidenceLimitError,
  verifyEvidenceMetadata,
} from "../lib/reportEvidence";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function publicRecord(record: TrafficReportRecord) {
  return CreateTrafficReportResponse.parse({
    id: record.id,
    reportNumber: record.reportNumber,
    category: record.category,
    location: record.location,
    originalReport: record.originalReport,
    evidence: normalizeStoredEvidence(record.evidence).map(({ name, type, size }) => ({
      name,
      type,
      size,
    })),
    analysis: record.analysis,
    analysisStatus: record.analysisStatus,
    status: record.status,
    submittedAt: record.submittedAt.toISOString(),
    language: record.language,
    englishTranslation: record.englishTranslation,
  });
}

router.post("/reports/session", (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  getResidentOwnerId(req, res);
  res.status(204).end();
});

router.get("/reports", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = ListTrafficReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose the resident or staff view." });
    return;
  }
  try {
    const staffView = parsed.data.view === "staff";
    const ownerId = staffView ? null : getResidentOwnerId(req, res);
    const records = await db.select().from(trafficReportsTable)
      .where(ownerId ? eq(trafficReportsTable.ownerId, ownerId) : undefined)
      .orderBy(desc(trafficReportsTable.submittedAt), desc(trafficReportsTable.id));
    res.json(ListTrafficReportsResponse.parse({
      reports: records.map(publicRecord),
      viewer: staffView ? "staff" : "resident",
    }));
  } catch {
    req.log.error("Report history could not be loaded");
    res.status(503).json({ error: "Report history is temporarily unavailable." });
  }
});

router.post("/reports", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = CreateTrafficReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the report details and try again." });
    return;
  }
  const { originalReport, evidence, clientSubmissionId, language, englishTranslation } = parsed.data;
  const evidenceItems = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  const evidenceError = reportEvidenceLimitError(evidenceItems);
  if (evidenceError) {
    res.status(400).json({ error: evidenceError });
    return;
  }
  const date = new Date(`${originalReport.date}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== originalReport.date ||
    originalReport.description.trim().length < 15 ||
    Boolean(originalReport.pinLatitude === null) !== Boolean(originalReport.pinLongitude === null)
  ) {
    res.status(400).json({ error: "Check the report date, description, and location." });
    return;
  }

  const ownerId = getResidentOwnerId(req, res);
  try {
    const [existing] = await db.select().from(trafficReportsTable).where(and(
      eq(trafficReportsTable.ownerId, ownerId),
      eq(trafficReportsTable.clientSubmissionId, clientSubmissionId),
    ));
    if (existing) {
      res.status(201).json(publicRecord(existing));
      return;
    }
  } catch {
    req.log.error("Report submission could not be checked for a prior save");
    res.status(503).json({ error: "Your report could not be saved. Please try again." });
    return;
  }

  if (evidenceItems.length > 0) {
    // Each token is bound to its own path. Never persist capabilities or expose
    // them in report history.
    if (!canSubmitEvidence(
      evidenceItems,
      (objectPath, previewToken) => canResidentPreviewEvidence(req, objectPath, previewToken),
    )) {
      res.status(400).json({ error: "The evidence authorization expired. Please attach the evidence again." });
      return;
    }
  }

  try {
    const evidenceMatchesStorage = await verifyEvidenceMetadata(
      evidenceItems,
      async (objectPath) => {
        const file = await objectStorageService.getObjectEntityFile(objectPath);
        const [metadata] = await file.getMetadata();
        return { size: metadata.size, contentType: metadata.contentType };
      },
    );
    if (!evidenceMatchesStorage) {
      res.status(400).json({ error: "The evidence changed or expired. Please attach the files again." });
      return;
    }
    const [created] = await db.insert(trafficReportsTable).values({
      ownerId,
      clientSubmissionId,
      reportNumber: `CIR-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      category: originalReport.issueType,
      location: originalReport.location,
      originalReport,
      evidence: evidenceItems.map(({ name, type, size, objectPath }) => ({
        name,
        type,
        size,
        objectPath,
      })),
      language,
      englishTranslation,
    }).onConflictDoNothing({
      target: [trafficReportsTable.ownerId, trafficReportsTable.clientSubmissionId],
    }).returning();

    // A retry of an already-saved request returns the same record.
    if (!created) {
      const [existing] = await db.select().from(trafficReportsTable).where(and(
        eq(trafficReportsTable.ownerId, ownerId),
        eq(trafficReportsTable.clientSubmissionId, clientSubmissionId),
      ));
      if (!existing) throw new Error("The saved report could not be read.");
      res.status(201).json(publicRecord(existing));
      return;
    }

    let analysis: TrafficReportRecord["analysis"] = null;
    let analysisStatus: TrafficReportRecord["analysisStatus"] = "unavailable";
    try {
      analysis = await generateReportAnalysis(originalReport, evidenceItems);
      analysisStatus = "complete";
    } catch {
      req.log.warn({ reportId: created.id }, "AI analysis unavailable; original report is saved");
    }

    // If this update fails, the inserted report still exists with pending analysis.
    let result = created;
    try {
      const [updated] = await db.update(trafficReportsTable)
        .set({ analysis, analysisStatus })
        .where(eq(trafficReportsTable.id, created.id)).returning();
      if (updated) result = updated;
    } catch {
      req.log.warn({ reportId: created.id }, "Report saved; analysis update pending");
    }
    res.status(201).json(publicRecord(result));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "The evidence changed or expired. Please attach the files again." });
      return;
    }
    req.log.error("Report submission could not be saved");
    res.status(503).json({ error: "Your report could not be saved. Please try again." });
  }
});

async function readReportEvidence(req: Request, res: Response, staffView: boolean): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const raw = req.params.reportId;
  const reportId = Array.isArray(raw) ? raw[0] : raw;
  if (!reportId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(reportId)) {
    res.status(404).end();
    return;
  }
  try {
    const ownerId = staffView ? null : getResidentOwnerId(req, res);
    const [record] = await db.select().from(trafficReportsTable).where(and(
      eq(trafficReportsTable.id, reportId),
    ));
    if (!record || !canReadReportEvidence(staffView, record.ownerId, ownerId)) {
      res.status(404).end();
      return;
    }
    const rawIndex = req.params.evidenceIndex;
    const evidenceIndex = rawIndex === undefined
      ? 0
      : Number(Array.isArray(rawIndex) ? rawIndex[0] : rawIndex);
    if (!Number.isSafeInteger(evidenceIndex) || evidenceIndex < 0) {
      res.status(404).end();
      return;
    }
    const evidence = normalizeStoredEvidence(record.evidence)[evidenceIndex];
    if (!evidence) {
      res.status(404).end();
      return;
    }
    const file = await objectStorageService.getObjectEntityFile(evidence.objectPath);
    const response = await objectStorageService.downloadObject(file);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) res.status(404).end();
    else {
      req.log.error("Report evidence could not be read");
      res.status(503).end();
    }
  }
}

router.get("/reports/:reportId/evidence", (req, res) => readReportEvidence(req, res, false));
router.get("/reports/:reportId/evidence/:evidenceIndex", (req, res) => readReportEvidence(req, res, false));
router.get("/staff/reports/:reportId/evidence/:evidenceIndex", (req, res) => readReportEvidence(req, res, true));

export default router;