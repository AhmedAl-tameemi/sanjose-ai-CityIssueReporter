import {
  createTrafficReport,
  ensureResidentReportSession,
  type TrafficReportEvidenceInput,
  type TrafficReportOriginal,
} from "@workspace/api-client-react";
import type { LanguageCode } from "../i18n";
import type { Report, ReportDraft } from "../types/report";

const submissionStorageKey = "traffic-signal-pending-submission";
let pendingSubmission: { fingerprint: string; id: string } | null = null;

function submissionId(fingerprint: string): string {
  try {
    const saved = window.localStorage.getItem(submissionStorageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as { fingerprint?: unknown; id?: unknown };
      if (parsed.fingerprint === fingerprint && typeof parsed.id === "string") {
        return parsed.id;
      }
    }
  } catch {
    // Idempotency still works within this page if browser storage is disabled.
  }
  if (pendingSubmission?.fingerprint !== fingerprint) {
    pendingSubmission = { fingerprint, id: crypto.randomUUID() };
  }
  try {
    window.localStorage.setItem(submissionStorageKey, JSON.stringify(pendingSubmission));
  } catch {
    // This cache is optional; the report itself is stored on the server.
  }
  return pendingSubmission.id;
}

export function clearPendingSubmission(): void {
  pendingSubmission = null;
  try {
    window.localStorage.removeItem(submissionStorageKey);
  } catch {
    // Optional browser cache only.
  }
}

export async function submitPersistentReport(
  draft: ReportDraft,
  language: LanguageCode,
  englishTranslation: Report["englishTranslation"],
  translationStatus: Report["translationStatus"],
): Promise<Report> {
  const originalReport: TrafficReportOriginal = {
    issueType: draft.issueType,
    location: draft.location || null,
    searchedAddress: draft.searchedAddress || null,
    pinLatitude: draft.pinLatitude ?? null,
    pinLongitude: draft.pinLongitude ?? null,
    date: draft.date,
    approximateTime: draft.approximateTime,
    description: draft.description,
    frequency: draft.frequency,
    name: draft.name || null,
    email: draft.email?.trim() || null,
    phone: draft.phone || null,
  };
  const evidence: TrafficReportEvidenceInput | null = draft.evidence
    ? { ...draft.evidence, type: draft.evidence.type as TrafficReportEvidenceInput["type"] }
    : null;
  const fingerprint = JSON.stringify({ originalReport, evidence, language });
  const clientSubmissionId = submissionId(fingerprint);

  // Establish the cookie before the potentially long-running submission so a
  // lost submission response can safely be retried by the same owner.
  await ensureResidentReportSession();
  const saved = await createTrafficReport(
    { clientSubmissionId, originalReport, evidence, language, englishTranslation: englishTranslation ?? null },
    { headers: evidence ? { "X-Resident-Preview-Token": evidence.previewToken } : {} },
  );
  return {
    ...saved.originalReport,
    location: saved.originalReport.location ?? "",
    searchedAddress: saved.originalReport.searchedAddress ?? undefined,
    pinLatitude: saved.originalReport.pinLatitude ?? undefined,
    pinLongitude: saved.originalReport.pinLongitude ?? undefined,
    name: saved.originalReport.name ?? undefined,
    email: saved.originalReport.email ?? undefined,
    phone: saved.originalReport.phone ?? undefined,
    evidence: saved.evidence ? draft.evidence : undefined,
    reportId: saved.id,
    reportNumber: saved.reportNumber,
    submittedAt: saved.submittedAt,
    language,
    englishTranslation: saved.englishTranslation ?? undefined,
    translationStatus,
    analysis: saved.analysis,
    analysisStatus: saved.analysisStatus,
    status: saved.status,
  };
}