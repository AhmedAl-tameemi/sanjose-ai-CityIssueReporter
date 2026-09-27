import assert from "node:assert/strict";
import test from "node:test";
import {
  draftStorageKey,
  fetchResidentEvidenceBlob,
  readDraft,
  readReport,
  reportStorageKey,
  residentEvidencePreviewRequest,
  saveDraft,
  saveReport,
} from "../src/reportStorage.ts";
import { blankDraft } from "../src/types/report.ts";

const evidence = {
  name: "streetlight.png",
  type: "image/png",
  size: 8192,
  objectPath: "/objects/evidence/123e4567-e89b-12d3-a456-426614174000",
  previewToken: "opaque-preview-capability",
};

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("saved drafts persist an object path, not image bytes", () => {
  const storage = new MemoryStorage();
  const draft = {
    ...blankDraft,
    evidence: { ...evidence, dataUrl: "data:image/png;base64,IMAGE_BYTES" },
  };

  saveDraft(draft, storage);

  const json = storage.getItem(draftStorageKey);
  const saved = JSON.parse(json);
  assert.equal(saved.evidence.objectPath, evidence.objectPath);
  assert.equal(saved.evidence.previewToken, evidence.previewToken);
  assert.equal("dataUrl" in saved.evidence, false);
  assert.equal(json.includes("IMAGE_BYTES"), false);
  assert.equal(readDraft(storage).evidence.objectPath, evidence.objectPath);
});

test("confirmation restores report number and loads its stored image after a fresh read", async () => {
  const storage = new MemoryStorage();
  const report = {
    ...blankDraft,
    reportNumber: "CIR-2026-ABC123",
    submittedAt: "2026-09-24T12:00:00.000Z",
    language: "en",
    evidence: { ...evidence, dataUrl: "data:image/png;base64,IMAGE_BYTES" },
  };

  saveReport(report, storage);

  // A second read represents the confirmation page mounting after navigation or reload.
  const restored = readReport(storage);
  assert.equal(restored.reportNumber, report.reportNumber);
  assert.equal(restored.evidence.objectPath, evidence.objectPath);
  assert.equal("dataUrl" in JSON.parse(storage.getItem(reportStorageKey)).evidence, false);

  const previewRequest = residentEvidencePreviewRequest(restored.evidence);
  assert.equal(previewRequest.url, `/api/storage${evidence.objectPath}`);
  assert.deepEqual(previewRequest.init.headers, {
    "X-Resident-Preview-Token": evidence.previewToken,
  });
  assert.equal(previewRequest.url.includes(evidence.previewToken), false);

  let fetchedUrl;
  let fetchedHeaders;
  const imageBytes = "persisted image bytes";
  const blob = await fetchResidentEvidenceBlob(restored.evidence, async (url, init) => {
    fetchedUrl = url;
    fetchedHeaders = init.headers;
    return new Response(new Blob([imageBytes], { type: evidence.type }), { status: 200 });
  });
  assert.equal(fetchedUrl, previewRequest.url);
  assert.deepEqual(fetchedHeaders, previewRequest.init.headers);
  assert.equal(await blob.text(), imageBytes);
});

test("confirmation drops legacy evidence data URLs instead of treating them as object paths", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    reportStorageKey,
    JSON.stringify({
      reportNumber: "CIR-2026-OLD123",
      evidence: {
        name: "legacy.png",
        type: "image/png",
        size: 12,
        dataUrl: "data:image/png;base64,IMAGE_BYTES",
      },
    }),
  );

  assert.equal(readReport(storage).evidence, undefined);
  assert.equal(
    residentEvidencePreviewRequest({
      objectPath: "data:image/png;base64,IMAGE_BYTES",
      previewToken: evidence.previewToken,
    }),
    undefined,
  );
});