import {
  createTrafficReport,
  ensureResidentReportSession,
  type TrafficReportEvidenceInput,
  type TrafficReportOriginal,
} from "@workspace/api-client-react";
import type { LanguageCode } from "../i18n";
import type { Report, ReportDraft } from "../types/report";
import { getSubmissionId } from "./submissionIdentity";
export { clearPendingSubmission } from "./submissionIdentity";

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
  const draftEvidence = draft.evidence ?? [];
  const evidence: TrafficReportEvidenceInput[] = draftEvidence.map((item) => ({
    ...item,
    type: item.type as TrafficReportEvidenceInput["type"],
  }));
  const fingerprint = JSON.stringify({ originalReport, evidence, language });
  const clientSubmissionId = getSubmissionId(fingerprint);

  // Establish the cookie before the potentially long-running submission so a
  // lost submission response can safely be retried by the same owner.
  await ensureResidentReportSession();
  const saved = await createTrafficReport(
    { clientSubmissionId, originalReport, evidence, language, englishTranslation: englishTranslation ?? null },
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
    evidence: saved.evidence.length ? draftEvidence : undefined,
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