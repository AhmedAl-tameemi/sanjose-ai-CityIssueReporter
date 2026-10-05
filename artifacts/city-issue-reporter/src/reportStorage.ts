import {
  blankDraft,
  isEvidenceObjectPath,
  isEvidencePreviewToken,
  type EvidenceImage,
  type Report,
  type ReportDraft,
} from "./types/report.ts";
import {
  evidenceSizeLimit,
  maxCombinedEvidenceSize,
  maxEvidenceAttachments,
  supportedEvidenceTypes,
} from "./lib/mediaEvidence.ts";

export const draftStorageKey = "city-issue-reporter-draft-v2";
export const reportStorageKey = "city-issue-reporter-last-report";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredEvidence = {
  name?: unknown;
  type?: unknown;
  size?: unknown;
  objectPath?: unknown;
  previewToken?: unknown;
};

function readEvidenceItem(value: unknown): EvidenceImage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const stored = value as StoredEvidence;
  if (
    typeof stored.name !== "string" ||
    typeof stored.type !== "string" ||
    typeof stored.size !== "number" ||
    stored.size <= 0 ||
    stored.size > evidenceSizeLimit(stored.type) ||
    !(supportedEvidenceTypes as readonly string[]).includes(stored.type) ||
    !isEvidenceObjectPath(stored.objectPath) ||
    !isEvidencePreviewToken(stored.previewToken)
  ) {
    return undefined;
  }
  return {
    name: stored.name,
    type: stored.type,
    size: stored.size,
    objectPath: stored.objectPath,
    previewToken: stored.previewToken,
  };
}

function readEvidence(value: unknown): EvidenceImage[] {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  const valid = items.map(readEvidenceItem).filter((item): item is EvidenceImage => Boolean(item));
  const combinedSize = valid.reduce((total, item) => total + item.size, 0);
  return valid.length <= maxEvidenceAttachments && combinedSize <= maxCombinedEvidenceSize
    ? valid
    : [];
}

export function readDraft(storage: StorageLike = window.localStorage): ReportDraft {
  try {
    const saved = storage.getItem(draftStorageKey);
    if (!saved) return blankDraft;
    const parsed = JSON.parse(saved) as Partial<ReportDraft> & {
      evidence?: unknown;
    };
    const hasCoordinates =
      typeof parsed.pinLatitude === "number" &&
      Number.isFinite(parsed.pinLatitude) &&
      Math.abs(parsed.pinLatitude) <= 90 &&
      typeof parsed.pinLongitude === "number" &&
      Number.isFinite(parsed.pinLongitude) &&
      Math.abs(parsed.pinLongitude) <= 180;
    return {
      ...blankDraft,
      ...parsed,
      evidence: readEvidence(parsed.evidence),
      searchedAddress:
        hasCoordinates && typeof parsed.searchedAddress === "string"
          ? parsed.searchedAddress
          : "",
      pinLatitude: hasCoordinates ? parsed.pinLatitude : undefined,
      pinLongitude: hasCoordinates ? parsed.pinLongitude : undefined,
    };
  } catch {
    return blankDraft;
  }
}

function sanitizedDraft(draft: ReportDraft): ReportDraft {
  return { ...draft, evidence: readEvidence(draft.evidence) };
}

export function saveDraft(
  draft: ReportDraft,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(draftStorageKey, JSON.stringify(sanitizedDraft(draft)));
}

export function removeDraft(storage: StorageLike = window.localStorage): void {
  storage.removeItem(draftStorageKey);
}

export function saveReport(
  report: Report,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(
    reportStorageKey,
    JSON.stringify({ ...report, evidence: readEvidence(report.evidence) }),
  );
}

export function readReport(storage: StorageLike = window.localStorage): Report | null {
  try {
    const saved = storage.getItem(reportStorageKey);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Report & { evidence?: unknown };
    return { ...parsed, evidence: readEvidence(parsed.evidence) };
  } catch {
    return null;
  }
}

export function residentEvidencePreviewRequest(
  evidence: Pick<EvidenceImage, "objectPath" | "previewToken"> | undefined,
): { url: string; init: RequestInit } | undefined {
  if (
    !evidence ||
    !isEvidenceObjectPath(evidence.objectPath) ||
    !isEvidencePreviewToken(evidence.previewToken)
  ) {
    return undefined;
  }

  return {
    url: `/api/storage${evidence.objectPath}`,
    init: { headers: { "X-Resident-Preview-Token": evidence.previewToken } },
  };
}

export async function fetchResidentEvidenceBlob(
  evidence: Pick<EvidenceImage, "objectPath" | "previewToken"> | undefined,
  fetcher: typeof fetch = fetch,
): Promise<Blob | undefined> {
  const request = residentEvidencePreviewRequest(evidence);
  if (!request) return undefined;

  const response = await fetcher(request.url, request.init);
  if (!response.ok) {
    throw new Error("The secured image preview could not be loaded.");
  }
  return response.blob();
}