export const supportedEvidenceTypes = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav',
  'video/webm', 'video/mp4', 'video/quicktime',
] as const;

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