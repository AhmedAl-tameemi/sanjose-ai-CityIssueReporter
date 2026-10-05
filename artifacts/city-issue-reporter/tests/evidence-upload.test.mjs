import assert from 'node:assert/strict';
import test from 'node:test';
import { sendEvidenceFile, uploadEvidenceBatch } from '../src/lib/mediaEvidence.ts';

class FakeRequest {
  static requests = [];
  upload = {};
  status = 201;
  response = { objectPath: 'private-test-path' };
  constructor() { FakeRequest.requests.push(this); }
  open(method, path) { this.method = method; this.path = path; }
  setRequestHeader(key, value) { this.header = [key, value]; }
  send(file) { this.file = file; }
  abort() { this.onabort(); }
}

test('upload transport exposes progress but waits for a successful server response', async () => {
  const original = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeRequest;
  try {
    const file = new File(['test'], 'voice.m4a', { type: 'audio/x-m4a' });
    const progress = [];
    const controller = new AbortController();
    let settled = false;
    const uploading = sendEvidenceFile(file, controller.signal, (value) => progress.push(value));
    uploading.then(() => { settled = true; });
    const request = FakeRequest.requests.at(-1);
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/api/storage/evidence');
    assert.deepEqual(request.header, ['Content-Type', 'audio/mp4']);
    assert.equal(request.file, file);
    request.upload.onprogress({ lengthComputable: true, loaded: 1, total: 4 });
    request.upload.onprogress({ lengthComputable: false });
    request.upload.onprogress({ lengthComputable: true, loaded: 4, total: 4 });
    await Promise.resolve();
    assert.deepEqual(progress, [25, undefined, 100]);
    assert.equal(settled, false, '100% sent must not mean attached');
    request.onload();
    assert.deepEqual(await uploading, request.response);
    controller.abort(); // Finished requests have detached their abort listener.
  } finally { globalThis.XMLHttpRequest = original; }
});

test('network, timeout, HTTP errors and cancellation reject instead of attaching', async () => {
  const original = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeRequest;
  try {
    for (const failure of ['network', 'timeout', 'http', 'abort']) {
      const controller = new AbortController();
      const uploading = sendEvidenceFile(new File(['a'], 'photo.png', { type: 'image/png' }), controller.signal, () => {});
      const rejected = assert.rejects(uploading);
      const request = FakeRequest.requests.at(-1);
      if (failure === 'network') request.onerror();
      if (failure === 'timeout') request.ontimeout();
      if (failure === 'http') { request.status = 503; request.onload(); }
      if (failure === 'abort') controller.abort();
      await rejected;
    }
    const controller = new AbortController();
    controller.abort();
    const before = FakeRequest.requests.length;
    await assert.rejects(sendEvidenceFile(new File(['a'], 'photo.png'), controller.signal, () => {}), { name: 'AbortError' });
    assert.equal(FakeRequest.requests.length, before);
  } finally { globalThis.XMLHttpRequest = original; }
});

test('cancelling a batch never starts waiting files or publishes a late attachment', async () => {
  const controller = new AbortController();
  const attempted = [];
  const current = [{ size: 1 }];
  const result = await uploadEvidenceBatch(
    [new File(['a'], 'first.png'), new File(['b'], 'second.png')], current,
    async (file) => {
      attempted.push(file.name);
      controller.abort();
      return { size: file.size };
    },
    () => assert.fail('Cancelled uploads must not change the form'),
    undefined, controller.signal,
  );
  assert.deepEqual(attempted, ['first.png']);
  assert.deepEqual(result.attachments, current);
});

test('retrying against a fuller report still enforces count and combined-size limits', async () => {
  const file = new File(['retry'], 'retry.png');
  for (const [current, error] of [
    [Array.from({ length: 5 }, () => ({ size: 1 })), 'count'],
    [[{ size: 25 * 1024 * 1024 }], 'combined-size'],
  ]) {
    const result = await uploadEvidenceBatch([file], current, () => assert.fail('Over-limit retries must not upload'), () => {});
    assert.equal(result.error, error);
    assert.deepEqual(result.attachments, current);
  }
});
