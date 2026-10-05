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

/** XHR exposes byte progress for uploads; fetch does not. Completion still waits
 * for the server response, not merely for all request bytes to be sent. */
export function sendEvidenceFile(
  file: File,
  signal: AbortSignal,
  onProgress: (percent: number | undefined) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload cancelled.', 'AbortError'));
      return;
    }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    const fail = () => {
      cleanup();
      reject(new Error('Evidence upload failed.'));
    };
    request.open('POST', '/api/storage/evidence');
    request.setRequestHeader('Content-Type', evidenceContentType(file.type));
    request.responseType = 'json';
    request.timeout = 120_000;
    request.upload.onprogress = (event) => {
      onProgress(event.lengthComputable && event.total > 0
        ? Math.min(100, Math.floor(event.loaded / event.total * 100))
        : undefined);
    };
    request.onload = () => {
      cleanup();
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('Evidence upload failed.'));
      } else {
        resolve(request.response);
      }
    };
    request.onerror = fail;
    request.ontimeout = fail;
    request.onabort = () => {
      cleanup();
      reject(new DOMException('Upload cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      request.send(file);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

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
  signal?: AbortSignal,
): Promise<{ attachments: T[]; failedFiles: File[]; error?: EvidenceSelectionError }> {
  const error = validateEvidenceSelection(files, current, replaceIndex);
  if (error) return { attachments: [...current], failedFiles: [...files], error };

  let attachments = [...current];
  const failedFiles: File[] = [];
  const selected = replaceIndex === undefined ? files : files.slice(0, 1);
  for (const file of selected) {
    if (signal?.aborted) break;
    try {
      const uploaded = await uploadOne(file);
      if (signal?.aborted) break;
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
