import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evidenceContentType,
  evidenceSizeLimit,
  maxCombinedEvidenceSize,
  maxEvidenceAttachments,
  supportedEvidenceTypes,
  uploadEvidenceBatch,
  validateEvidenceSelection,
} from '../src/lib/mediaEvidence.ts';
import { evidenceRows } from '../src/evidenceI18n.ts';
import { readDraft, saveDraft } from '../src/reportStorage.ts';
import { blankDraft } from '../src/types/report.ts';
import { getSubmissionId, submissionStorageKey } from '../src/lib/submissionIdentity.ts';

test('normalizes recorded MIME types and common mobile audio aliases', () => {
  assert.equal(evidenceContentType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(evidenceContentType('audio/x-m4a'), 'audio/mp4');
  assert.equal(evidenceContentType('audio/x-wav'), 'audio/wav');
  assert.ok(supportedEvidenceTypes.includes('video/quicktime'));
});
test('keeps distinct photo, audio and video size limits', () => {
  assert.equal(evidenceSizeLimit('image/png'), 3 * 1024 * 1024);
  assert.equal(evidenceSizeLimit('audio/webm'), 10 * 1024 * 1024);
  assert.equal(evidenceSizeLimit('video/mp4'), 20 * 1024 * 1024);
});
test('all new evidence controls are translated in every supported language', () => {
  for (const [key, translations] of Object.entries(evidenceRows)) {
    assert.equal(translations.length, 13, key);
    assert.ok(translations.every((value) => value.length > 0), key);
  }
});
test('audio and video drafts retain metadata and private paths, never recorded bytes', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; }, removeItem: () => {} };
  for (const type of ['audio/webm', 'video/mp4']) {
    const evidence = {
      name: 'incident-recording', type, size: 2000,
      objectPath: '/objects/evidence/00000000-0000-4000-8000-000000000001',
      previewToken: 'test-only-capability',
    };
    saveDraft({ ...blankDraft, evidence: [{ ...evidence, dataUrl: 'data:media;base64,not-to-be-saved' }] }, storage);
    assert.deepEqual(readDraft(storage).evidence, [evidence]);
    assert.ok(!saved.includes('base64'));
  }
});

test('enforces a five-file and 25 MiB combined evidence limit', () => {
  assert.equal(maxEvidenceAttachments, 5);
  assert.equal(maxCombinedEvidenceSize, 25 * 1024 * 1024);
  const current = Array.from({ length: 4 }, () => ({ size: 1 }));
  assert.equal(validateEvidenceSelection([{ size: 1 }, { size: 1 }], current), 'count');
  assert.equal(validateEvidenceSelection([{ size: maxCombinedEvidenceSize }], current), 'combined-size');
  assert.equal(validateEvidenceSelection([{ size: 1 }], current), undefined);
  assert.equal(validateEvidenceSelection([{ size: 1 }], current, 0), undefined);
});

test('a partial multi-file upload keeps successes and supports retrying failed files only', async () => {
  const prior = { name: 'already-attached', size: 10 };
  const files = [
    { name: 'first.jpg', size: 20 },
    { name: 'temporary-failure.jpg', size: 30 },
    { name: 'last.jpg', size: 40 },
  ];
  const changes = [];
  const initial = await uploadEvidenceBatch(
    files,
    [prior],
    async (file) => {
      if (file.name === 'temporary-failure.jpg') throw new Error('network interruption');
      return { name: file.name, size: file.size };
    },
    (attachments) => changes.push(attachments),
  );

  assert.deepEqual(initial.attachments.map((item) => item.name), ['already-attached', 'first.jpg', 'last.jpg']);
  assert.deepEqual(initial.failedFiles.map((file) => file.name), ['temporary-failure.jpg']);
  assert.equal(changes.length, 2);

  const retried = await uploadEvidenceBatch(
    initial.failedFiles,
    initial.attachments,
    async (file) => ({ name: file.name, size: file.size }),
    () => {},
  );
  assert.deepEqual(retried.attachments.map((item) => item.name), [
    'already-attached',
    'first.jpg',
    'last.jpg',
    'temporary-failure.jpg',
  ]);
  assert.deepEqual(retried.failedFiles, []);
});

test('failed individual replacement leaves the saved evidence untouched', async () => {
  const saved = [{ name: 'original.jpg', size: 12 }];
  const result = await uploadEvidenceBatch(
    [{ name: 'replacement.jpg', size: 18 }],
    saved,
    async () => { throw new Error('upload failed'); },
    () => assert.fail('A failed replacement must not replace the saved item'),
    0,
  );
  assert.deepEqual(result.attachments, saved);
  assert.equal(result.failedFiles[0].name, 'replacement.jpg');
});

test('report submission retries reuse the same client id for the same evidence set', () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  const evidence = [
    { objectPath: '/objects/evidence/one', previewToken: 'token-one' },
    { objectPath: '/objects/evidence/two', previewToken: 'token-two' },
  ];
  const fingerprint = JSON.stringify({ description: 'same report', evidence, language: 'en' });
  const firstAttemptId = getSubmissionId(fingerprint, storage, () => 'stable-submission-id');
  const retryId = getSubmissionId(fingerprint, storage, () => 'unexpected-new-id');
  assert.equal(firstAttemptId, 'stable-submission-id');
  assert.equal(retryId, firstAttemptId);
  assert.equal(JSON.parse(saved.get(submissionStorageKey)).id, firstAttemptId);
});