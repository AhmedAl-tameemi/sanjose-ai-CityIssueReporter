import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright-core';

// Uses the running app, but intercepts every API: never stores media or submits live reports.
const baseUrl = process.env.TEST_APP_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:80');
const objectPath = '/objects/evidence/00000000-0000-4000-8000-000000000001';
const reportId = '00000000-0000-4000-8000-000000000002';
const previewToken = 'recording-test-capability';
const draft = {
  issueType: 'Potholes', location: 'Test map pin', searchedAddress: '', pinLatitude: 37.3382, pinLongitude: -121.8863,
  date: '2026-10-01', approximateTime: '10 am', description: 'There is a large pothole near the intersection.', frequency: 'One time',
  name: '', email: '', phone: '',
};
let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
});
after(async () => { await browser?.close(); });

async function open(mode = 'allowed', uploadFails = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let uploaded;
  let record;
  await page.addInitScript(({ mode, draft }) => {
    localStorage.setItem('city-issue-reporter-language', 'en');
    localStorage.setItem('city-issue-reporter-draft-v2', JSON.stringify(draft));
    window.mediaCalls = [];
    window.advanceClock = 0;
    const now = Date.now.bind(Date);
    Date.now = () => now() + window.advanceClock;
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.mediaCalls.push(constraints);
      if (mode === 'denied') throw new DOMException('Denied', 'NotAllowedError');
      const stream = await native(constraints);
      window.testStream = stream;
      return stream;
    };
    if (mode === 'unsupported') window.MediaRecorder = undefined;
  }, { mode, draft });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (pathname === '/api/storage/evidence') {
      if (uploadFails) return json({ error: 'Test failure' }, 503);
      uploaded = { bytes: request.postDataBuffer(), type: request.headers()['content-type'] };
      return json({ objectPath, contentType: uploaded.type, size: uploaded.bytes.length, previewToken }, 201);
    }
    if (pathname.startsWith('/api/storage/objects/')) {
      assert.equal(request.headers()['x-resident-preview-token'], previewToken);
      return route.fulfill({ contentType: uploaded?.type ?? 'audio/webm', body: uploaded?.bytes ?? Buffer.alloc(0) });
    }
    if (pathname === '/api/reports/session') return route.fulfill({ status: 204 });
    if (pathname === '/api/reports' && request.method() === 'POST') {
      const body = request.postDataJSON();
      assert.equal(body.evidence.length, 1);
      assert.equal(body.evidence[0].type, uploaded.type);
      assert.equal(body.evidence[0].objectPath, objectPath);
      assert.equal(body.evidence[0].previewToken, previewToken);
      assert.equal(request.headers()['x-resident-preview-token'], undefined);
      record = {
        id: reportId, reportNumber: 'TEST-RECORDING', category: body.originalReport.issueType,
        location: body.originalReport.location, originalReport: body.originalReport,
        evidence: [{ name: body.evidence[0].name, type: body.evidence[0].type, size: body.evidence[0].size }],
        language: body.language, englishTranslation: body.englishTranslation, analysis: null, analysisStatus: 'unavailable',
        status: 'submitted', submittedAt: new Date().toISOString(),
      };
      return json(record, 201);
    }
    if (pathname === '/api/reports') return json({ reports: record ? [record] : [], viewer: 'resident' });
    if (pathname === `/api/reports/${reportId}/evidence/0`) return route.fulfill({ contentType: uploaded.type, body: uploaded.bytes });
    return json({});
  });
  await page.goto(`${baseUrl}/?view=report`);
  await page.getByTestId('button-continue').click();
  await page.getByTestId('button-continue').click();
  await page.getByTestId('button-record-audio').waitFor();
  assert.equal(await page.evaluate(() => window.mediaCalls.length), 0, 'No permission request on page load');
  return { page, context, errors, getUploaded: () => uploaded };
}

async function capture(page, kind) {
  await page.getByTestId(`button-record-${kind}`).click();
  await page.getByTestId('button-stop-recording').waitFor();
  await page.waitForTimeout(1300);
  assert.equal(await page.getByTestId('button-submit-report').isDisabled(), true);
  await page.getByTestId('button-stop-recording').click();
  await page.getByTestId('button-attach-recording').waitFor();
  assert.equal(await page.evaluate(() => window.testStream.getTracks().every((track) => track.readyState === 'ended')), true);
}

// Decode real browser-generated bytes, rather than stubbing HTMLMediaElement.play().
let playbackFixtures;
async function fixtures() {
  if (playbackFixtures) return playbackFixtures;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.route('**/api/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.goto(baseUrl);
    const encoded = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 60;
      canvas.getContext('2d').fillRect(0, 0, 80, 60);
      const result = [{ name: 'photo.png', type: 'image/png', base64: canvas.toDataURL().split(',')[1] }];
      for (const kind of ['audio', 'video']) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' });
        try {
          const recorder = new MediaRecorder(stream, { mimeType: kind === 'audio' ? 'audio/webm' : 'video/webm' });
          const chunks = [];
          const stopped = new Promise((resolve, reject) => {
            recorder.ondataavailable = (event) => chunks.push(event.data);
            recorder.onerror = reject;
            recorder.onstop = resolve;
          });
          recorder.start();
          await new Promise((resolve) => setTimeout(resolve, 1500));
          recorder.stop();
          await stopped;
          // Stored evidence uses the normalized container MIME, without codec parameters.
          const blob = new Blob(chunks, { type: `${kind}/webm` });
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          result.push({ name: `${kind}.webm`, type: blob.type, base64 });
        } finally {
          stream.getTracks().forEach((track) => track.stop());
        }
      }
      return result;
    });
    playbackFixtures = encoded.map(({ base64, ...metadata }) => ({ ...metadata, bytes: Buffer.from(base64, 'base64') }));
    return playbackFixtures;
  } finally { await context.close(); }
}

async function assertPlayback(player, kind) {
  await player.waitFor();
  await player.scrollIntoViewIfNeeded();
  if (kind === 'image') {
    await player.evaluate((image) => image.decode());
    assert.equal(await player.evaluate((image) => image.complete && image.naturalWidth === 80 && image.naturalHeight === 60), true);
    return;
  }
  assert.equal(await player.evaluate((media) => media.controls), true, 'Native playback controls must be available');
  if (kind === 'video') assert.equal(await player.evaluate((media) => media.playsInline), true);
  await player.evaluate(async (media) => {
    media.muted = true;
    await media.play();
  });
  await player.evaluate((media) => new Promise((resolve, reject) => {
    const deadline = performance.now() + 10000;
    const check = () => {
      if (media.error) return reject(new Error(media.error.message));
      if (media.currentTime > 0.1 && media.readyState >= 2) return resolve();
      if (performance.now() > deadline) return reject(new Error('Evidence playback did not advance'));
      setTimeout(check, 25);
    };
    check();
  }));
  if (kind === 'video') {
    assert.equal(await player.evaluate((media) => media.videoWidth > 0 && media.videoHeight > 0), true, 'Video frames must decode');
  }
  await player.evaluate((media) => media.pause());
  assert.equal(await player.evaluate((media) => media.paused && !media.error), true);
}

async function openPlayback(files, legacy = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  const previewRequests = new Set();
  const historyRequests = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  const evidence = files.map((file, index) => ({
    name: file.name, type: file.type, size: file.bytes.length,
    objectPath: `/objects/evidence/00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
    previewToken: `playback-test-capability-${index}`,
  }));
  const saved = {
    ...draft, reportId, reportNumber: 'TEST-PLAYBACK', submittedAt: '2026-10-01T10:00:00Z',
    language: 'en', evidence: legacy ? evidence[0] : evidence,
  };
  const record = {
    id: reportId, reportNumber: saved.reportNumber, category: draft.issueType, location: draft.location,
    originalReport: draft, evidence: evidence.map(({ name, type, size }) => ({ name, type, size })),
    language: 'en', englishTranslation: null, analysis: null, analysisStatus: 'unavailable',
    status: 'submitted', submittedAt: saved.submittedAt,
  };
  await page.addInitScript((saved) => {
    localStorage.setItem('city-issue-reporter-language', 'en');
    // Old confirmation records stored an evidence object, not an array.
    localStorage.setItem('city-issue-reporter-last-report', JSON.stringify(saved));
  }, saved);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/reports/session') return route.fulfill({ status: 204 });
    if (pathname === '/api/reports' && request.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ reports: [record], viewer: 'resident' }) });
    }
    const previewIndex = evidence.findIndex((item) => pathname === `/api/storage${item.objectPath}`);
    const historyIndex = evidence.findIndex((_, index) => pathname === `/api/reports/${reportId}/evidence/${index}`);
    const index = previewIndex >= 0 ? previewIndex : historyIndex;
    if (index >= 0) {
      if (previewIndex >= 0) {
        assert.equal(request.headers()['x-resident-preview-token'], evidence[index].previewToken);
        previewRequests.add(index);
      } else {
        historyRequests.add(index);
      }
      if (files[index].status) {
        return route.fulfill({
          status: files[index].status,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Evidence unavailable' }),
        });
      }
      return route.fulfill({ contentType: files[index].type, body: files[index].bytes });
    }
    errors.push(`Unexpected API request: ${request.method()} ${pathname}`);
    return route.fulfill({ status: 404 });
  });
  return { page, context, errors, previewRequests, historyRequests };
}

async function assertEvidenceEntries(page, files, view) {
  const entries = view === 'confirmation'
    ? page.locator('.confirmation-evidence-item')
    : page.getByTestId(`card-report-${reportId}`).locator('.history-photo-item');
  await entries.last().waitFor();
  assert.equal(await entries.count(), files.length, `${view} must render every attachment`);
  for (const [index, file] of files.entries()) {
    const entry = entries.nth(index);
    const kind = file.type.split('/')[0];
    const player = entry.locator(kind === 'image' ? 'img' : kind);
    // Lazy images need to enter the viewport before a real decode error can occur.
    await entry.scrollIntoViewIfNeeded();
    if (file.broken) {
      const alert = entry.getByRole('alert');
      await alert.waitFor();
      assert.equal(await alert.innerText(), 'The evidence preview could not be loaded. Saved evidence is also available in Report History.');
      assert.equal(await entry.locator('img, audio, video').count(), 0, 'Replace the broken player, not the whole evidence list');
    } else {
      assert.equal(await entry.getByRole('alert').count(), 0);
      if (kind === 'image') assert.ok((await player.getAttribute('alt')).includes(file.name));
      else assert.ok((await player.getAttribute('aria-label')).includes(file.name));
      await assertPlayback(player, kind);
    }
    assert.ok((await entry.innerText()).includes(file.name), `Attachment ${index} must retain its name`);
  }
}

for (const kind of ['image', 'audio', 'video']) {
  for (const failure of ['corrupt', 404, 503]) {
    test(`${kind} evidence with ${failure === 'corrupt' ? 'corrupt bytes' : `HTTP ${failure}`} shows a per-file error without breaking other evidence in confirmation and history`, async () => {
      const healthy = await fixtures();
      const source = healthy.find((file) => file.type.startsWith(`${kind}/`));
      const broken = {
        ...source,
        name: `unavailable-${source.name}`,
        broken: true,
        ...(failure === 'corrupt' ? { bytes: Buffer.from('Not valid media bytes') } : { status: failure }),
      };
      const files = [healthy[0], broken, ...healthy.slice(1)];
      const { page, context, errors, previewRequests, historyRequests } = await openPlayback(files);
      try {
        await page.goto(`${baseUrl}/confirmation`);
        await assertEvidenceEntries(page, files, 'confirmation');
        await page.reload();
        await assertEvidenceEntries(page, files, 'confirmation');
        await page.getByTestId('button-view-report-history').click();
        await page.waitForURL('**/history');
        await assertEvidenceEntries(page, files, 'history');
        await page.reload();
        await assertEvidenceEntries(page, files, 'history');
        assert.deepEqual([...previewRequests].sort(), [0, 1, 2, 3]);
        assert.deepEqual([...historyRequests].sort(), [0, 1, 2, 3]);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}

test('all five mixed-media attachments decode and play in confirmation, after reload, and in history', async () => {
  const [photo, audio, video] = await fixtures();
  const files = [photo, audio, video, { ...photo, name: 'second-photo.png' }, { ...audio, name: 'second-audio.webm' }];
  const { page, context, errors, previewRequests, historyRequests } = await openPlayback(files);
  try {
    await page.goto(`${baseUrl}/confirmation`);
    await assertEvidenceEntries(page, files, 'confirmation');
    await page.reload();
    await assertEvidenceEntries(page, files, 'confirmation');
    await page.getByTestId('button-view-report-history').click();
    await page.waitForURL('**/history');
    await assertEvidenceEntries(page, files, 'history');
    await page.reload();
    await assertEvidenceEntries(page, files, 'history');
    assert.deepEqual([...previewRequests].sort(), [0, 1, 2, 3, 4]);
    assert.deepEqual([...historyRequests].sort(), [0, 1, 2, 3, 4]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const kind of ['image', 'audio', 'video']) {
  test(`legacy single-${kind} attachment decodes and plays in confirmation and history`, async () => {
    const file = (await fixtures()).find((file) => file.type.startsWith(`${kind}/`));
    const { page, context, errors, previewRequests, historyRequests } = await openPlayback([file], true);
    try {
      await page.goto(`${baseUrl}/confirmation`);
      await assertEvidenceEntries(page, [file], 'confirmation');
      await page.reload();
      await assertEvidenceEntries(page, [file], 'confirmation');
      await page.getByTestId('button-view-report-history').click();
      await page.waitForURL('**/history');
      await assertEvidenceEntries(page, [file], 'history');
      assert.deepEqual([...previewRequests], [0]);
      assert.deepEqual([...historyRequests], [0]);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const kind of ['audio', 'video']) {
  test(`${kind} records with permission, previews, attaches and plays after submit/reload/history`, async () => {
    const { page, context, errors, getUploaded } = await open();
    try {
      await capture(page, kind);
      assert.equal(await page.evaluate(() => Boolean(window.mediaCalls[0].video)), kind === 'video');
      await page.getByTestId('button-attach-recording').click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="button-submit-report"]').disabled);
      assert.ok(getUploaded().bytes.length > 20);
      assert.ok(getUploaded().type.startsWith(`${kind}/`));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByTestId('button-submit-report').click();
      await page.waitForURL('**/confirmation');
      await page.locator(`${kind}.evidence-media`).waitFor();
      await page.reload();
      await page.locator(`${kind}.evidence-media`).waitFor();
      await page.goto(`${baseUrl}/history`);
      await page.locator(`${kind}.evidence-media`).waitFor();
      await page.locator(`${kind}.evidence-media`).evaluate(async (player) => { player.muted = true; await player.play(); });
      await page.waitForFunction((kind) => document.querySelector(`${kind}.evidence-media`)?.currentTime > 0.1, kind);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('denied/unsupported device access leaves file upload and reporting available', async () => {
  for (const mode of ['denied', 'unsupported']) {
    const { page, context, errors } = await open(mode);
    try {
      await page.getByTestId('button-record-video').click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByTestId('button-add-evidence').isEnabled(), true);
      assert.equal(await page.getByTestId('button-submit-report').isEnabled(), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('discard, navigation, backgrounding and automatic time limit release all device tracks', async () => {
  for (const action of ['discard', 'navigation', 'limit', 'hidden']) {
    const { page, context } = await open();
    try {
      await page.getByTestId('button-record-video').click();
      await page.getByTestId('button-stop-recording').waitFor();
      await page.waitForTimeout(1100);
      if (action === 'discard') await page.getByTestId('button-discard-recording').click();
      if (action === 'navigation') await page.getByTestId('nav-home').click();
      if (action === 'limit') {
        await page.evaluate(() => { window.advanceClock = 31000; });
        await page.getByTestId('button-attach-recording').waitFor();
      }
      if (action === 'hidden') {
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.getByTestId('button-attach-recording').waitFor();
      }
      await page.waitForFunction(() => window.testStream.getTracks().every((track) => track.readyState === 'ended'));
      if (action === 'discard') assert.equal(await page.getByTestId('button-attach-recording').count(), 0);
    } finally { await context.close(); }
  }
});

test('failed attachment upload retains the recording in the per-file retry queue', async () => {
  const { page, context, errors } = await open('allowed', true);
  try {
    if (process.env.TEST_SCREENSHOT_PATH) await page.screenshot({ path: process.env.TEST_SCREENSHOT_PATH, fullPage: true });
    await capture(page, 'audio');
    await page.getByTestId('button-attach-recording').click();
    await page.getByRole('alert').waitFor();
    const retry = page.getByRole('button', { name: /^Retry upload: incident-audio-/ });
    await retry.waitFor();
    assert.equal(await retry.isEnabled(), true);
    await page.getByTestId('button-record-audio').waitFor();
    assert.equal(await page.getByTestId('button-attach-recording').count(), 0);
    await retry.click();
    await page.getByTestId('button-record-audio').waitFor();
    await page.getByRole('button', { name: /^Remove attachment: incident-audio-/ }).click();
    assert.equal(await retry.count(), 0);
    assert.equal(await page.getByTestId('button-submit-report').isEnabled(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});