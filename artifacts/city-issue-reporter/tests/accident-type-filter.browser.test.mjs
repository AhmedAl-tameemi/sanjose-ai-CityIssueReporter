import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const reporterDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const types = ["Head On", "Rear End", "Other"];
const incidents = ["Head On", "Rear End"].map((collisionType, index) => ({
  id: String(index + 1), latitude: 37.3382 + index / 1000, longitude: -121.8863,
  occurredAt: "2025-01-01T12:00:00Z", year: "2025", location: `Test ${collisionType}`,
  collisionType, severity: "none",
}));
const blankTile = Buffer.from(
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
    { cwd: reporterDirectory, env: { ...process.env, BASE_PATH: "/", NODE_ENV: "test", PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverOutput}`);
    try { if ((await fetch(baseUrl)).ok) break; } catch { /* wait for test server */ }
    await delay(100);
  }
  const executablePath = process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) server.kill("SIGTERM");
});

test("accident type filtering works in map and list and stays selected when switching views", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mapRequests = [];
  const listRequests = [];
  const matching = (type) => !type || type === "all" ? incidents : incidents.filter((item) => item.collisionType === type);
  await page.route("**/api/city-incidents**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    mapRequests.push(params.get("accidentType"));
    const matches = matching(params.get("accidentType"));
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        incidents: matches, totalMatched: matches.length, limit: 1000, truncated: false, unmappedCount: 0,
        availableYears: ["2025"], availableTypes: types, fetchedAt: "2026-10-08T12:00:00Z",
        sourceName: "Test City data", sourceUrl: "https://data.sanjoseca.gov/dataset/crash-locations-last-five-years",
      }),
    });
  });
  await page.route("**/api/city-accidents**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    listRequests.push(params.get("accidentType"));
    const matches = matching(params.get("accidentType"));
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        incidents: matches, total: matches.length, page: 1, pageSize: 25, accidentTypes: types,
        availableYears: ["2025"], syncStatus: "ready", skippedCount: 0, lastSyncedAt: "2026-10-08T12:00:00Z",
        sourceUrl: "https://data.sanjoseca.gov/dataset/crash-locations-last-five-years",
      }),
    });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: blankTile }));
  try {
    await page.goto(`${baseUrl}/accidents?view=map`);
    await page.getByTestId("select-incident-type").selectOption({ label: "Head On" });
    await page.getByTestId("button-incident-1").waitFor();
    assert.ok(mapRequests.includes("Head On"));
    assert.equal(await page.getByTestId("button-incident-2").count(), 0);
    assert.equal(await page.locator(".leaflet-interactive").count(), 1);

    await page.getByTestId("select-incident-type").selectOption("Other");
    await page.getByTestId("empty-incidents").waitFor();
    assert.equal(await page.locator(".leaflet-interactive").count(), 0);
    await page.getByTestId("select-incident-type").selectOption("Head On");
    await page.getByTestId("button-incident-1").waitFor();

    await page.getByTestId("view-accidents-list").click();
    await page.getByTestId("row-accident-1").waitFor({ state: "attached" });
    assert.equal(await page.getByTestId("select-accident-type").inputValue(), "Head On");
    assert.ok(listRequests.includes("Head On"));
    assert.equal(await page.getByTestId("row-accident-2").count(), 0);
    await page.getByTestId("select-accident-type").selectOption("Rear End");
    await page.getByTestId("row-accident-2").waitFor({ state: "attached" });

    await page.getByTestId("view-accidents-map").click();
    await page.getByTestId("button-incident-2").waitFor();
    assert.equal(await page.getByTestId("select-incident-type").inputValue(), "Rear End");
    assert.equal(await page.getByTestId("button-incident-1").count(), 0);
    await page.getByTestId("select-incident-type").selectOption("");
    await page.getByTestId("button-incident-1").waitFor();
    assert.equal(await page.locator(".leaflet-interactive").count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await page.close();
  }
});
