export const imageEvidenceSize = 3 * 1024 * 1024;
export const maxEvidenceSize = 20 * 1024 * 1024;

export function evidenceSizeLimit(contentType: string | null): number {
  if (contentType?.startsWith("image/")) return imageEvidenceSize;
  if (contentType?.startsWith("audio/")) return 10 * 1024 * 1024;
  return maxEvidenceSize;
}

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
  "video/webm",
  "video/mp4",
  "video/quicktime",
]);

export type EvidenceValidationError = {
  status: 400 | 413 | 415;
  message: string;
};

export function getEvidenceContentType(value: string | undefined): string | null {
  return value ? value.split(";")[0].trim().toLowerCase() : null;
}

export function validateEvidenceHeaders(
  contentType: string | null,
  contentLength: string | undefined,
): EvidenceValidationError | null {
  if (!contentType || !allowedContentTypes.has(contentType)) {
    return {
      status: 415,
      message: "Use a supported photo, audio, or video file.",
    };
  }

  const length = contentLength === undefined ? Number.NaN : Number(contentLength);
  if (Number.isFinite(length) && length > evidenceSizeLimit(contentType)) {
    return { status: 413, message: "Evidence exceeds its media size limit." };
  }

  return null;
}

export function validateEvidenceBytes(
  contentType: string | null,
  bytes: Buffer,
): EvidenceValidationError | null {
  if (bytes.length === 0) {
    return { status: 400, message: "An evidence file is required." };
  }
  if (bytes.length > evidenceSizeLimit(contentType)) {
    return { status: 413, message: "Evidence exceeds its media size limit." };
  }
  if (!contentType || !allowedContentTypes.has(contentType) || !matchesEvidenceType(contentType, bytes)) {
    return { status: 400, message: "The uploaded file does not match its media type." };
  }

  return null;
}

function matchesEvidenceType(contentType: string, bytes: Buffer): boolean {
  if (contentType.startsWith("image/")) return detectImageType(bytes) === contentType;
  if (contentType.endsWith("/webm")) {
    return bytes.length >= 12 &&
      bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
      bytes.subarray(0, 4096).includes(Buffer.from("webm"));
  }
  if (contentType.endsWith("/mp4") || contentType === "video/quicktime") {
    return bytes.length >= 16 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (contentType === "audio/ogg") {
    return bytes.length >= 27 && bytes.subarray(0, 4).toString("ascii") === "OggS";
  }
  if (contentType === "audio/wav") {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WAVE";
  }
  if (contentType === "audio/mpeg") {
    return bytes.length >= 3 && (bytes.subarray(0, 3).toString("ascii") === "ID3" ||
      (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0));
  }
  return false;
}

export function detectImageType(bytes: Buffer): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
      bytes.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}