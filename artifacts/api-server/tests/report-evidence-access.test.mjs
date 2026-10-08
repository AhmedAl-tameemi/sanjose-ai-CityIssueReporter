import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadReportEvidence,
  canSubmitEvidence,
  maxCombinedEvidenceSize,
  maxEvidenceAttachments,
  normalizeStoredEvidence,
  reportEvidenceLimitError,
  verifyEvidenceMetadata,
} from "../src/lib/reportEvidence.ts";
import {
  canResidentPreviewEvidence,
  createResidentEvidencePreviewToken,
} from "../src/lib/staffAuth.ts";

process.env.SESSION_SECRET = "unit-test-signing-secret-not-for-production";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const pathA = "/objects/evidence/10000000-0000-4000-8000-000000000001";
const pathB = "/objects/evidence/20000000-0000-4000-8000-000000000002";

function attachment(objectPath, previewToken, size = 10, type = "image/png") {
  return {
    name: "evidence",
    type,
    size,
    objectPath,
    previewToken,
  };
}

test("resident evidence stays owner-scoped while the explicitly public staff view allows readers without a session", () => {
  assert.equal(canReadReportEvidence(false, ownerA, ownerA), true);
  assert.equal(canReadReportEvidence(false, ownerA, ownerB), false);
  assert.equal(canReadReportEvidence(false, ownerA, null), false);
  assert.equal(canReadReportEvidence(true, ownerA, null), true);
});

test("each submitted private attachment must carry its own matching path capability", () => {
  const tokenA = createResidentEvidencePreviewToken(pathA);
  const tokenB = createResidentEvidencePreviewToken(pathB);
  const requestWithoutSharedHeader = { header: () => undefined };
  const authorize = (objectPath, token) =>
    canResidentPreviewEvidence(requestWithoutSharedHeader, objectPath, token);

  assert.equal(canSubmitEvidence([
    attachment(pathA, tokenA),
    attachment(pathB, tokenB),
  ], authorize), true);
  assert.equal(canSubmitEvidence([
    attachment(pathA, tokenA),
    attachment(pathB, tokenA),
  ], authorize), false);
});

test("server rejects more than five attachments or more than 25 MiB combined", () => {
  const five = Array.from({ length: maxEvidenceAttachments }, () => attachment(pathA, "token", 1));
  assert.equal(reportEvidenceLimitError(five), undefined);
  assert.equal(reportEvidenceLimitError([...five, attachment(pathA, "token", 1)]), "A report can include up to 5 evidence files.");
  assert.equal(maxCombinedEvidenceSize, 25 * 1024 * 1024);
  assert.equal(reportEvidenceLimitError([
    attachment(pathA, "token", maxCombinedEvidenceSize),
    attachment(pathB, "token", 1),
  ]), "Evidence files must total 25 MiB or less.");
});

test("combined size is checked against trusted object metadata, not client-declared sizes", async () => {
  const first = attachment(pathA, "token-a", 12 * 1024 * 1024, "video/mp4");
  const second = attachment(pathB, "token-b", 13 * 1024 * 1024, "video/mp4");
  const metadata = new Map([
    [pathA, { size: String(first.size), contentType: first.type }],
    [pathB, { size: String(second.size), contentType: second.type }],
  ]);
  const readMetadata = async (path) => metadata.get(path);

  assert.equal(await verifyEvidenceMetadata([first, second], readMetadata), true);
  assert.equal(await verifyEvidenceMetadata([
    { ...second, size: 1 },
  ], readMetadata), false);

  const oversized = Array.from({ length: maxEvidenceAttachments }, (_, index) => {
    const objectPath = `/objects/evidence/30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const item = attachment(objectPath, `token-${index}`, 6 * 1024 * 1024, "video/mp4");
    metadata.set(objectPath, { size: String(item.size), contentType: item.type });
    return item;
  });
  assert.equal(await verifyEvidenceMetadata(oversized, readMetadata), false);
});

test("legacy single-object report evidence is normalized without losing its first attachment", () => {
  const legacy = { name: "old.jpg", type: "image/jpeg", size: 42, objectPath: pathA };
  assert.deepEqual(normalizeStoredEvidence(legacy), [legacy]);
  assert.deepEqual(normalizeStoredEvidence([legacy]), [legacy]);
  assert.deepEqual(normalizeStoredEvidence(null), []);
});