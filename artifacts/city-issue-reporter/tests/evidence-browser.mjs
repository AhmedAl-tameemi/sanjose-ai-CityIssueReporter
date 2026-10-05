import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright-core';

export const browserName = process.env.TEST_BROWSER ?? 'chromium';
if (!['chromium', 'webkit', 'firefox'].includes(browserName)) {
  throw new Error(`Unknown TEST_BROWSER: ${browserName}`);
}

export async function launchEvidenceBrowser() {
  if (browserName === 'chromium') {
    return chromium.launch({
      executablePath: process.env.CHROMIUM_PATH ?? execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    });
  }
  if (browserName === 'firefox') {
    return firefox.launch({ headless: true, executablePath: process.env.FIREFOX_PATH ?? firefox.executablePath() });
  }
  const executable = process.env.WEBKIT_PATH ?? webkit.executablePath();
  return webkit.launch({
    headless: true,
    executablePath: process.env.REPLIT_LD_LIBRARY_PATH
      ? fileURLToPath(new URL('./webkit-launcher.sh', import.meta.url)) : executable,
    env: { ...process.env, PLAYWRIGHT_WEBKIT_EXECUTABLE: executable },
  });
}
