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

test('failed attachment upload preserves the local recording for retry', async () => {
  const { page, context, errors } = await open('allowed', true);
  try {
    if (process.env.TEST_SCREENSHOT_PATH) await page.screenshot({ path: process.env.TEST_SCREENSHOT_PATH, fullPage: true });
    await capture(page, 'audio');
    await page.getByTestId('button-attach-recording').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByTestId('button-attach-recording').isEnabled(), true);
    assert.equal(await page.getByTestId('button-submit-report').isDisabled(), true);
    await page.getByTestId('button-discard-recording').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="button-submit-report"]').disabled);
    assert.equal(await page.getByTestId('button-submit-report').isEnabled(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});