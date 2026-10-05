export const submissionStorageKey = "traffic-signal-pending-submission";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type PendingSubmission = { fingerprint: string; id: string };

let pendingSubmission: PendingSubmission | null = null;

export function getSubmissionId(
  fingerprint: string,
  storage: StorageLike = window.localStorage,
  createId: () => string = () => crypto.randomUUID(),
): string {
  try {
    const saved = storage.getItem(submissionStorageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as { fingerprint?: unknown; id?: unknown };
      if (parsed.fingerprint === fingerprint && typeof parsed.id === "string") return parsed.id;
    }
  } catch {
    // In-memory retry identity still works if optional browser storage is unavailable.
  }

  if (pendingSubmission?.fingerprint !== fingerprint) {
    pendingSubmission = { fingerprint, id: createId() };
  }
  try {
    storage.setItem(submissionStorageKey, JSON.stringify(pendingSubmission));
  } catch {
    // The in-memory ID remains stable for retries in this page.
  }
  return pendingSubmission.id;
}

export function clearPendingSubmission(
  storage: StorageLike = window.localStorage,
): void {
  pendingSubmission = null;
  try {
    storage.removeItem(submissionStorageKey);
  } catch {
    // Optional browser cache only.
  }
}