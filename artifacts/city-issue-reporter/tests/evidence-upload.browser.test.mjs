import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright-core';

test('named queued uploads, failed-only retry, replacement and removal preserve attachments', async () => {
  const browser = await chromium.launch({
    executablePath: execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('city-issue-reporter-language', 'en');
      localStorage.setItem('city-issue-reporter-draft-v2', JSON.stringify({
        issueType: 'Potholes', location: 'Test pin', searchedAddress: '',
        pinLatitude: 37.3382, pinLongitude: -121.8863, date: '2026-10-01',
        approximateTime: '10 am', description: 'A large pothole near the intersection.',
        frequency: 'One time', name: '', email: '', phone: '',
      }));
    });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const uploads = [];
    let fail = true;
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname === '/api/storage/evidence') {
        const bytes = request.postDataBuffer();
        const marker = bytes.toString();
        uploads.push(marker);
        if (uploads.length === 1) await gate;
        if ((marker === 'second' || marker === 'replacement') && fail) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          return;
        }
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
          objectPath: `/objects/evidence/00000000-0000-4000-8000-${String(uploads.length).padStart(12, '0')}`,
          contentType: request.headers()['content-type'], size: bytes.length,
          previewToken: 'upload-test-capability',
        }) });
        return;
      }
      if (new URL(request.url()).pathname.startsWith('/api/storage/objects/')) {
        await route.fulfill({ contentType: 'image/png', body: Buffer.from('test-preview') });
        return;
      }
      await route.fulfill({ contentType: 'application/json', body: '{}' });
    });
    const baseUrl = process.env.TEST_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
    await page.goto(`${baseUrl}/?view=report`);
    await page.getByTestId('button-continue').click();
    await page.getByTestId('button-continue').click();
    const file = (name, bytes) => ({ name, mimeType: 'image/png', buffer: Buffer.from(bytes) });
    await page.getByTestId('input-evidence').setInputFiles([file('first.png', 'first'), file('second.png', 'second'), file('third.png', 'third')]);
    await page.getByTestId('evidence-upload-1').locator('progress').waitFor();
    assert.match(await page.getByTestId('evidence-upload-2').innerText(), /second.png.*Waiting to upload/s);
    assert.equal(await page.getByTestId('button-submit-report').isDisabled(), true);
    release();
    await page.getByRole('button', { name: 'Retry upload: second.png', exact: true }).waitFor();
    await page.getByTestId('evidence-item-1').waitFor();
    assert.deepEqual(uploads, ['first', 'second', 'third']);
    fail = false;
    await page.getByRole('button', { name: 'Retry upload: second.png', exact: true }).click();
    await page.getByTestId('evidence-item-2').waitFor();
    assert.deepEqual(uploads, ['first', 'second', 'third', 'second']);
    assert.equal(await page.locator('[data-testid^="evidence-upload-"]').count(), 0);

    fail = true;
    await page.getByTestId('button-replace-evidence-0').click();
    await page.getByTestId('input-evidence').setInputFiles(file('replacement.png', 'replacement'));
    await page.getByRole('button', { name: 'Retry upload: replacement.png', exact: true }).waitFor();
    assert.match(await page.getByTestId('evidence-item-0').innerText(), /first.png/);
    // Removing an earlier attachment must not redirect replacement to a shifted index.
    await page.getByTestId('button-remove-evidence-1').click();
    fail = false;
    await page.getByRole('button', { name: 'Retry upload: replacement.png', exact: true }).click();
    await page.getByTestId('evidence-item-0').getByText('replacement.png', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-testid^="evidence-item-"]').count(), 2);
    await page.getByTestId('button-remove-evidence-0').click();
    assert.match(await page.getByTestId('evidence-item-0').innerText(), /second.png/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
