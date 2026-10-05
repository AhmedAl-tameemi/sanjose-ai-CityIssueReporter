export const supportedEvidenceTypes = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav',
  'video/webm', 'video/mp4', 'video/quicktime',
] as const;

export const maxEvidenceAttachments = 5;

export function evidenceContentType(type: string): string {
  const normalized = type.split(';')[0].trim().toLowerCase();
  if (normalized === 'audio/x-m4a') return 'audio/mp4';
  if (normalized === 'audio/x-wav') return 'audio/wav';
  return normalized;
}

export function evidenceSizeLimit(type: string): number {
  return (type.startsWith('image/') ? 3 : type.startsWith('audio/') ? 10 : 20) * 1024 * 1024;
}

export function recordingMimeType(kind: 'audio' | 'video'): string | undefined {
  const candidates = kind === 'video'
    ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export type EvidenceSelectionError = 'count' | 'combined-size';

export function validateEvidenceSelection(
  files: readonly File[],
  current: readonly { size: number }[],
  replaceIndex?: number,
): EvidenceSelectionError | undefined {
  const selected = replaceIndex === undefined ? files : files.slice(0, 1);
  const retained = current.filter((_, index) => index !== replaceIndex);
  if (retained.length + selected.length > maxEvidenceAttachments) return 'count';
  const combinedSize = retained.reduce((total, item) => total + item.size, 0) +
    selected.reduce((total, file) => total + file.size, 0);
  if (combinedSize > maxCombinedEvidenceSize) return 'combined-size';
  return undefined;
}

export async function uploadEvidenceBatch<T extends { size: number }>(
  files: readonly File[],
  current: readonly T[],
  uploadOne: (file: File) => Promise<T>,
  onChange: (attachments: T[]) => void,
  replaceIndex?: number,
): Promise<{ attachments: T[]; failedFiles: File[]; error?: EvidenceSelectionError }> {
  const error = validateEvidenceSelection(files, current, replaceIndex);
  if (error) return { attachments: [...current], failedFiles: [...files], error };

  let attachments = [...current];
  const failedFiles: File[] = [];
  const selected = replaceIndex === undefined ? files : files.slice(0, 1);
  for (const file of selected) {
    try {
      const uploaded = await uploadOne(file);
      if (replaceIndex === undefined) attachments = [...attachments, uploaded];
      else attachments = attachments.map((item, index) => index === replaceIndex ? uploaded : item);
      onChange(attachments);
    } catch {
      // Keep earlier successful uploads and the prior file when a replacement fails.
      failedFiles.push(file);
    }
  }
  return { attachments, failedFiles };
}

export const maxCombinedEvidenceSize = 25 * 1024 * 1024;
