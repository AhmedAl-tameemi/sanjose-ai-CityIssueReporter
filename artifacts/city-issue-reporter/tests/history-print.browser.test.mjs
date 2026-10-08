import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const reporterDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureReport = {
  id: "fixture-main",
  reportNumber: "TS-TEST-001",
  category: "Unsafe driving",
  location: "Test intersection",
  originalReport: {
    issueType: "Unsafe driving",
    location: "Test intersection",
    searchedAddress: "Test street address",
    pinLatitude: 37.3382,
    pinLongitude: -121.8863,
    date: "2026-10-07",
    approximateTime: "8:30 AM",
    description: "A resident-provided test statement about an unsafe turn.",
    frequency: "One time",
    name: "Test Resident",
    email: "resident@example.invalid",
    phone: null,
  },
  evidence: [{ name: "test-photo.png", type: "image/png", size: 1024 }],
  analysis: {
    summary: "An unverified automated test summary describes the resident's statement. One test photo was submitted with this report.",
    urgency: "medium",
    suggestedCategory: "unsafe_driving",
    recommendedAction: "Review the resident statement and attached evidence.",
  },
  analysisStatus: "complete",
  status: "submitted",
  submittedAt: "2026-10-08T15:00:00Z",
  language: "es",
  englishTranslation: {
    location: "Translated test intersection",
    approximateTime: "8:30 AM",
    description: "A translated test statement.",
  },
};
const secondReport = {
  ...fixtureReport,
  id: "fixture-other",
  reportNumber: "TS-TEST-002",
  evidence: [],
  analysis: null,
  analysisStatus: "unavailable",
  englishTranslation: null,
};
const blankPhoto = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cKJkAAAAASUVORK5CYII=",
  "base64",
);

let browser;
let server;
let baseUrl;
let serverOutput = "";

before(async () => {
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const port = probe.address().port;
  await new Promise((resolveClose) => probe.close(resolveClose));
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [resolve(reporterDirectory, "node_modules/vite/bin/vite.js"), "--config", "vite.config.ts", "--host", "127.0.0.1"],
    {
      cwd: reporterDirectory,
      env: { ...process.env, BASE_PATH: "/", NODE_ENV: "test", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverOutput}`);
    try {
      if ((await fetch(baseUrl)).ok) break;
    } catch { /* wait for test server */ }
    await delay(100);
  }
  const executablePath =
    process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) server.kill("SIGTERM");
});

async function openHistory(viewer) {
  // Synthetic fixture PIN and session state, never production credentials.
  let authenticated = viewer === "staff";
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; };
  });
  await page.route(/\/api\/reports(?:\?.*)?$/, (route) => {
    const staffView = new URL(route.request().url()).searchParams.get("view") === "staff";
    if (staffView && !authenticated) return route.fulfill({
      status: 401, contentType: "application/json",
      body: JSON.stringify({ error: "Staff PIN sign-in is required." }),
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ viewer: staffView ? "staff" : "resident", reports: staffView ? [fixtureReport, secondReport] : [fixtureReport] }),
    });
  });
  await page.route("**/api/staff/login", (route) => {
    const body = route.request().postDataJSON();
    if (body.pin !== "0042") return route.fulfill({
      status: 401, contentType: "application/json", body: JSON.stringify({ error: "Incorrect staff PIN." }),
    });
    assert.deepEqual(body, { pin: "0042" });
    authenticated = true;
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ authenticated: true, staffId: "city-officials", role: "city-evidence-reviewer" }),
    });
  });
  await page.route("**/api/staff/logout", (route) => {
    authenticated = false;
    return route.fulfill({ status: 204 });
  });
  await page.route(/\/api\/(?:staff\/)?reports\/[^/]+\/evidence\/\d+$/, (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: blankPhoto,
  }));
  await page.goto(`${baseUrl}/history${viewer === "staff" ? "?view=staff" : ""}`);
  await page.getByTestId("card-report-fixture-main").waitFor();
  return page;
}

test("resident history does not offer city report compilation", async () => {
  const page = await openHistory("resident");
  try {
    assert.equal(await page.locator('[data-testid^="button-print-report-"]').count(), 0);
    assert.equal(await page.locator(".history-print-document").count(), 0);
  } finally {
    await page.close();
  }
});

test("shared PIN login rejects wrong codes, preserves a leading zero, and clears staff reports on sign-out", async () => {
  const page = await openHistory("resident");
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  try {
    await page.getByTestId("toggle-staff-access").click();
    await page.getByTestId("link-staff-view").click();
    const pin = page.getByTestId("input-staff-pin");
    await pin.waitFor();
    assert.equal(await page.locator("input[type=email]").count(), 0);
    assert.equal(await page.getByTestId("card-report-fixture-other").count(), 0);
    await pin.fill("1111");
    await page.getByTestId("button-staff-login").click();
    await page.getByTestId("text-staff-error").waitFor();
    assert.match(await page.getByTestId("text-staff-error").innerText(), /Incorrect staff PIN/);
    assert.equal(await page.getByTestId("card-report-fixture-other").count(), 0);
    await pin.fill("0042");
    await page.getByTestId("button-staff-login").click();
    await page.getByTestId("card-report-fixture-other").waitFor();
    assert.match(await page.getByTestId("text-history-privacy").innerText(), /PIN-protected access/);
    assert.ok(requests.some((url) => url.includes("/api/reports?view=staff")));
    const evidenceImage = page.getByTestId("card-report-fixture-main").getByTestId("history-evidence-0").locator("img");
    assert.equal(await evidenceImage.getAttribute("src"), "/api/staff/reports/fixture-main/evidence/0");
    await page.reload();
    await page.getByTestId("card-report-fixture-other").waitFor();
    assert.equal(await page.getByTestId("input-staff-pin").count(), 0);
    await page.getByTestId("button-staff-logout").click();
    await page.waitForURL(`${baseUrl}/history`);
    await page.getByTestId("card-report-fixture-main").waitFor();
    assert.equal(await page.getByTestId("card-report-fixture-other").count(), 0);
    assert.equal(await page.locator('[data-testid^="button-print-report-"]').count(), 0);
    assert.ok(requests.some((url) => url.endsWith("/api/staff/login")));
    assert.ok(requests.some((url) => url.endsWith("/api/staff/logout")));
    await page.goto(`${baseUrl}/history?view=staff`);
    await page.getByTestId("input-staff-pin").waitFor();
    assert.equal(await page.getByTestId("card-report-fixture-other").count(), 0);
    assert.equal(await page.locator('[data-testid^="button-print-report-"]').count(), 0);
  } finally {
    await page.close();
  }
});

test("staff printout compiles only the selected report and labels sources correctly", async () => {
  const page = await openHistory("staff");
  try {
    assert.equal(await page.locator('[data-testid^="button-print-report-"]').count(), 2);
    assert.equal(await page.getByTestId("text-ai-summary-fixture-main").innerText(), fixtureReport.analysis.summary);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByTestId("button-print-report-fixture-main").click();
    await page.waitForFunction(() => window.__printCalls === 1);
    await page.emulateMedia({ media: "print" });
    const document = page.locator(".history-print-document");
    assert.equal(await document.count(), 1);
    assert.equal(await document.isVisible(), true);
    const text = await document.innerText();
    assert.ok((await document.locator(".city-report-ai-summary").innerText()).includes(fixtureReport.analysis.summary));
    for (const expected of [
      "TS-TEST-001", "Test intersection", "Test street address", "2026-10-07", "8:30 AM",
      "37.338200, -121.886300", "Test Resident", "resident@example.invalid", "Not provided",
      "test-photo.png", "A translated test statement.", "unverified suggestion", "CONFIDENTIAL",
    ]) assert.ok(text.includes(expected), `Missing report detail: ${expected}`);
    assert.equal(text.includes("TS-TEST-002"), false);
    assert.equal(await document.getAttribute("lang"), "en");
    assert.equal(await document.getAttribute("dir"), "ltr");
    assert.equal(await page.getByTestId("card-report-fixture-other").isVisible(), false);
    assert.equal(await page.locator(".site-header").isVisible(), false);
    assert.equal(await page.locator(".app-nav").isVisible(), false);
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.screenshot({ path: "/tmp/city-report-fixture.png", fullPage: true });
    await page.pdf({ path: "/tmp/city-report-fixture.pdf", format: "A4" });
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.waitForFunction(() => !document.body.classList.contains("printing-city-report"));
    assert.equal(await page.locator(".history-print-document").count(), 0);
    assert.equal(await page.getByTestId("card-report-fixture-other").isVisible(), true);
  } finally {
    await page.close();
  }
});
