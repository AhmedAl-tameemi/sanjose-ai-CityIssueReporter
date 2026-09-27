import assert from "node:assert/strict";
import test from "node:test";
import {
  getEvidenceContentType,
  maxEvidenceSize,
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
      message: "Only JPEG, PNG, WebP, and GIF images are supported.",
    },
  );
  assert.deepEqual(
    validateEvidenceBytes("image/png", Buffer.from("not really a PNG")),
    {
      status: 400,
      message: "The uploaded file is not a valid image.",
    },
  );
  assert.deepEqual(
    validateEvidenceBytes("image/jpeg", Buffer.from(validImages[1].signature)),
    {
      status: 400,
      message: "The uploaded file is not a valid image.",
    },
  );
});

test("accepts evidence up to 3 MB and rejects larger uploads", () => {
  const atLimit = Buffer.alloc(maxEvidenceSize);
  Buffer.from(validImages[1].signature).copy(atLimit);
  assert.equal(validateEvidenceBytes("image/png", atLimit), null);

  const tooLarge = Buffer.alloc(maxEvidenceSize + 1);
  Buffer.from(validImages[1].signature).copy(tooLarge);
  assert.equal(validateEvidenceBytes("image/png", tooLarge)?.status, 413);
  assert.equal(validateEvidenceHeaders("image/png", String(maxEvidenceSize + 1))?.status, 413);
});

test("normalizes content-type headers before validation", () => {
  assert.equal(getEvidenceContentType(" Image/PNG ; charset=binary "), "image/png");
});