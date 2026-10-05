import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceContentType, evidenceSizeLimit, supportedEvidenceTypes } from '../src/lib/mediaEvidence.ts';
import { evidenceRows } from '../src/evidenceI18n.ts';
import { readDraft, saveDraft } from '../src/reportStorage.ts';
import { blankDraft } from '../src/types/report.ts';

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
    saveDraft({ ...blankDraft, evidence: { ...evidence, dataUrl: 'data:media;base64,not-to-be-saved' } }, storage);
    assert.deepEqual(readDraft(storage).evidence, evidence);
    assert.ok(!saved.includes('base64'));
  }
});