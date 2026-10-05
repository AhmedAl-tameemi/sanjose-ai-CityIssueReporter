import assert from "node:assert/strict";
import test from "node:test";
import {
  getEvidenceContentType,
  imageEvidenceSize,
  validateEvidenceBytes,
  validateEvidenceHeaders,
} from "../src/lib/evidenceValidation.ts";

const validImages = [
  {
    contentType: "image/jpeg",
    signature: [0xff, 0xd8, 0xff, 0x00],
  },
  {
    contentType: "image/png",
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { contentType: "image/webp", signature: [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")] },
  { contentType: "image/gif", signature: [...Buffer.from("GIF89a"), 0x00] },
];

test("accepts every supported image type with a matching file signature", () => {
  for (const image of validImages) {
    assert.equal(
      validateEvidenceBytes(image.contentType, Buffer.from(image.signature)),
      null,
      image.contentType,
    );
  }
});

test("rejects unsupported content types and mismatched or unknown signatures", () => {
  assert.deepEqual(
    validateEvidenceHeaders("image/svg+xml", "12"),
    {
      status: 415,
      message: "Use a supported photo, audio, or video file.",
    },
  );
  assert.deepEqual(
    validateEvidenceBytes("image/png", Buffer.from("not really a PNG")),
    {
      status: 400,
      message: "The uploaded file does not match its media type.",
    },
  );
  assert.deepEqual(
    validateEvidenceBytes("image/jpeg", Buffer.from(validImages[1].signature)),
    {
      status: 400,
      message: "The uploaded file does not match its media type.",
    },
  );
});

test("accepts evidence up to 3 MB and rejects larger uploads", () => {
  const atLimit = Buffer.alloc(imageEvidenceSize);
  Buffer.from(validImages[1].signature).copy(atLimit);
  assert.equal(validateEvidenceBytes("image/png", atLimit), null);

  const tooLarge = Buffer.alloc(imageEvidenceSize + 1);
  Buffer.from(validImages[1].signature).copy(tooLarge);
  assert.equal(validateEvidenceBytes("image/png", tooLarge)?.status, 413);
  assert.equal(validateEvidenceHeaders("image/png", String(imageEvidenceSize + 1))?.status, 413);
});

test("accepts supported audio/video containers and rejects mislabeled bytes", () => {
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from("....webm....")]);
  const mp4 = Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom0000")]);
  for (const type of ["audio/webm", "video/webm"]) assert.equal(validateEvidenceBytes(type, webm), null);
  for (const type of ["audio/mp4", "video/mp4", "video/quicktime"]) assert.equal(validateEvidenceBytes(type, mp4), null);
  assert.equal(validateEvidenceBytes("audio/wav", Buffer.from("RIFF0000WAVE")), null);
  assert.equal(validateEvidenceBytes("audio/mpeg", Buffer.from("ID3data")), null);
  assert.equal(validateEvidenceBytes("audio/ogg", Buffer.concat([Buffer.from("OggS"), Buffer.alloc(23)])), null);
  for (const type of ["audio/webm", "video/mp4", "audio/wav"]) {
    assert.equal(validateEvidenceBytes(type, Buffer.from("<html>not media</html>"))?.status, 400);
  }
});

test("enforces separate photo, audio and video byte limits", () => {
  assert.equal(validateEvidenceHeaders("audio/webm", String(10 * 1024 * 1024)), null);
  assert.equal(validateEvidenceHeaders("audio/webm", String(10 * 1024 * 1024 + 1))?.status, 413);
  assert.equal(validateEvidenceHeaders("video/mp4", String(20 * 1024 * 1024)), null);
  assert.equal(validateEvidenceHeaders("video/mp4", String(20 * 1024 * 1024 + 1))?.status, 413);
});

test("normalizes content-type headers before validation", () => {
  assert.equal(getEvidenceContentType(" Image/PNG ; charset=binary "), "image/png");
});