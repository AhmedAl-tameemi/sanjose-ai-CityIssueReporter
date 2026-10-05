import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright-core';

// Mock browser speech results, not a transcription service. No live reports or audio are stored.
const baseUrl = process.env.TEST_APP_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:80');
let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});
after(async () => { await browser?.close(); });

async function open(mode = 'allowed', language = 'en') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ mode, language }) => {
    localStorage.setItem('city-issue-reporter-language', language);
    if (!localStorage.getItem('city-issue-reporter-draft-v2')) {
      localStorage.setItem('city-issue-reporter-draft-v2', JSON.stringify({
        issueType: 'Potholes', location: 'Existing map pin', searchedAddress: '', pinLatitude: 37.3382, pinLongitude: -121.8863,
        date: '2026-10-01', approximateTime: '10 am', description: 'A pothole has formed near the intersection.', frequency: 'One time',
        name: '', email: '', phone: '',
      }));
    }
    window.speechRecognizers = [];
    class FakeRecognition {
      constructor() { window.speechRecognizers.push(this); }
      start() {
        this.started = true;
        if (mode === 'denied') { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }
      }
      stop() { this.stopped = true; this.onend?.(); }
      abort() { this.aborted = true; this.onend?.(); }
      emit(text) { this.onresult?.({ results: [{ isFinal: true, 0: { transcript: text } }] }); this.stop(); }
    }
    window.SpeechRecognition = mode === 'allowed' || mode === 'denied' ? FakeRecognition : undefined;
    window.webkitSpeechRecognition = mode === 'webkit' ? FakeRecognition : undefined;
  }, { mode, language });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ lat: '37.3382', lon: '-121.8863', display_name: '200 E Santa Clara St, San José, CA',
      address: { house_number: '200', road: 'E Santa Clara St' } }]),
  }));
  await page.route('**/api/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.goto(`${baseUrl}/?view=report`);
  await page.getByTestId('button-voice-issue').waitFor();
  assert.equal(await page.evaluate(() => window.speechRecognizers.length), 0, 'No microphone session on load');
  return { context, page, errors };
}
async function speak(page, testId, text) {
  await page.getByTestId(testId).click();
  await page.evaluate((text) => window.speechRecognizers.at(-1).emit(text), text);
  await page.waitForFunction((testId) =>
    document.querySelector(`[data-testid="${testId}"]`)?.getAttribute('aria-pressed') === 'false', testId);
  // Fake speech events fire synchronously; allow React to commit and save the resulting draft.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('speech fills choices and text throughout the form, with validated address and saved draft', async () => {
  const { context, page, errors } = await open();
  try {
    await speak(page, 'button-voice-issue', 'Illegal dumping.');
    assert.equal(await page.getByTestId('button-issue-illegal-dumping').getAttribute('aria-checked'), 'true');
    await page.getByTestId('button-continue').click();
    await speak(page, 'button-voice-date', 'October 4, 2025');
    assert.equal(await page.getByTestId('input-date').inputValue(), '2025-10-04');
    if (process.env.TEST_DATE_SCREENSHOT_PATH) await page.screenshot({ path: process.env.TEST_DATE_SCREENSHOT_PATH, fullPage: true });
    await page.getByTestId('button-back').click();
    await speak(page, 'button-voice-location', '200 East Santa Clara Street, San Jose');
    await page.waitForFunction(() => document.querySelector('[data-testid="input-location"]').value.includes('San José'));
    await page.getByTestId('button-continue').click();
    await speak(page, 'button-voice-input-approximate-time', 'Around ten fifteen in the morning');
    await speak(page, 'button-voice-input-description', 'Several bags of household rubbish have been left beside the intersection.');
    await speak(page, 'button-voice-frequency', 'Happens every day');
    assert.equal(await page.getByTestId('select-frequency').inputValue(), 'Happens every day');
    await page.getByTestId('button-continue').click();
    await speak(page, 'button-voice-input-name', 'Test Resident');
    await speak(page, 'button-voice-input-email', 'resident at example dot com');
    await speak(page, 'button-voice-input-phone', '555 123 4567');
    assert.equal(await page.getByTestId('input-email').inputValue(), 'resident@example.com');
    assert.equal(await page.getByTestId('input-phone').inputValue(), '555 123 4567');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.reload();
    await page.getByTestId('button-continue').click();
    assert.equal(await page.getByTestId('input-description').inputValue(), 'Several bags of household rubbish have been left beside the intersection.');
    assert.equal(await page.getByTestId('select-frequency').inputValue(), 'Happens every day');
    await page.getByTestId('button-continue').click();
    assert.equal(await page.getByTestId('input-name').inputValue(), 'Test Resident');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('city-issue-reporter-draft-v2')).evidence), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('permission denial and unsupported browsers keep existing answers and manual controls', async () => {
  for (const mode of ['denied', 'unsupported']) {
    const { context, page, errors } = await open(mode);
    try {
      await page.getByTestId('button-voice-issue').click();
      await page.locator('.voice-input-feedback').waitFor();
      assert.equal(await page.getByTestId('button-issue-potholes').getAttribute('aria-checked'), 'true');
      assert.equal(await page.getByTestId('button-continue').isEnabled(), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('localized spoken choices use the selected language and webkit fallback', async () => {
  const { context, page } = await open('webkit', 'es');
  try {
    await speak(page, 'button-voice-issue', 'Baches');
    assert.equal(await page.evaluate(() => window.speechRecognizers.at(-1).lang), 'es-US');
    assert.equal(await page.getByTestId('button-issue-potholes').getAttribute('aria-checked'), 'true');
    await page.getByTestId('button-continue').click();
    await speak(page, 'button-voice-date', '4 de octubre de 2025');
    assert.equal(await page.getByTestId('input-date').inputValue(), '2025-10-04');
    await speak(page, 'button-voice-frequency', 'Ocurre todos los días');
    assert.equal(await page.getByTestId('select-frequency').inputValue(), 'Happens every day');
  } finally { await context.close(); }
});

test('unrecognized and future spoken dates keep the existing date and show guidance', async () => {
  const { context, page, errors } = await open();
  try {
    await page.getByTestId('button-continue').click();
    const existing = await page.getByTestId('input-date').inputValue();
    await speak(page, 'button-voice-date', 'next Thursday');
    assert.equal(await page.getByTestId('input-date').inputValue(), existing);
    assert.ok((await page.locator('#date-error').textContent()).includes('Say the month'));
    await speak(page, 'button-voice-date', 'October 4, 2030');
    assert.equal(await page.getByTestId('input-date').inputValue(), existing);
    assert.ok((await page.locator('#date-error').textContent()).includes('today or an earlier date'));
    await speak(page, 'button-voice-date', 'October 4, 2025');
    assert.equal(await page.getByTestId('input-date').inputValue(), '2025-10-04');
    assert.equal(await page.locator('#date-error').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('switching microphone fields, backgrounding and navigation cancel active listening', async () => {
  const { context, page, errors } = await open();
  try {
    await page.getByTestId('button-voice-issue').click();
    await page.getByTestId('button-voice-location').click();
    assert.equal(await page.evaluate(() => window.speechRecognizers[0].aborted), true);
    await page.getByTestId('nav-home').click();
    assert.equal(await page.evaluate(() => window.speechRecognizers.at(-1).aborted), true);
    await page.goto(`${baseUrl}/?view=report`);
    await page.getByTestId('button-voice-issue').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.speechRecognizers.at(-1).aborted), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});