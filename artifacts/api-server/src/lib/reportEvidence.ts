import type { TrafficReportEvidenceInput } from "@workspace/api-zod";
import type { TrafficReportEvidence, StoredTrafficReportEvidence } from "@workspace/db";

export const maxEvidenceAttachments = 5;
export const maxCombinedEvidenceSize = 25 * 1024 * 1024;

export function normalizeStoredEvidence(
  evidence: StoredTrafficReportEvidence,
): TrafficReportEvidence[] {
  if (Array.isArray(evidence)) return evidence;
  return evidence ? [evidence] : [];
}

export function reportEvidenceLimitError(
  evidence: TrafficReportEvidenceInput[],
): string | undefined {
  if (evidence.length > maxEvidenceAttachments) {
    return `A report can include up to ${maxEvidenceAttachments} evidence files.`;
  }
  const totalSize = evidence.reduce((total, item) => total + item.size, 0);
  if (totalSize > maxCombinedEvidenceSize) {
    return "Evidence files must total 25 MiB or less.";
  }
  return undefined;
}

export async function verifyEvidenceMetadata(
  evidence: TrafficReportEvidenceInput[],
  readMetadata: (objectPath: string) => Promise<{ size: unknown; contentType: unknown }>,
): Promise<boolean> {
  let combinedSize = 0;
  for (const item of evidence) {
    const metadata = await readMetadata(item.objectPath);
    const storedSize = Number(metadata.size);
    if (
      !Number.isSafeInteger(storedSize) ||
      storedSize < 1 ||
      storedSize !== item.size ||
      metadata.contentType !== item.type
    ) {
      return false;
    }
    combinedSize += storedSize;
    if (combinedSize > maxCombinedEvidenceSize) return false;
  }
  return evidence.length <= maxEvidenceAttachments;
}

export function canReadReportEvidence(
  isStaff: boolean,
  reportOwnerId: string,
  viewerOwnerId: string | null,
): boolean {
  return isStaff || (viewerOwnerId !== null && reportOwnerId === viewerOwnerId);
}

export function canSubmitEvidence(
  evidence: TrafficReportEvidenceInput[],
  authorizeEvidence: (objectPath: string, previewToken: string) => boolean,
): boolean {
  return evidence.every((item) =>
    authorizeEvidence(item.objectPath, item.previewToken),
  );
}