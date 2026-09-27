export const maxEvidenceSize = 3 * 1024 * 1024;

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
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
      message: "Only JPEG, PNG, WebP, and GIF images are supported.",
    };
  }

  const length = contentLength === undefined ? Number.NaN : Number(contentLength);
  if (Number.isFinite(length) && length > maxEvidenceSize) {
    return { status: 413, message: "Images must be 3 MB or smaller." };
  }

  return null;
}

export function validateEvidenceBytes(
  contentType: string | null,
  bytes: Buffer,
): EvidenceValidationError | null {
  if (bytes.length === 0) {
    return { status: 400, message: "An image file is required." };
  }
  if (bytes.length > maxEvidenceSize) {
    return { status: 413, message: "Images must be 3 MB or smaller." };
  }
  if (!contentType || detectImageType(bytes) !== contentType) {
    return { status: 400, message: "The uploaded file is not a valid image." };
  }

  return null;
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