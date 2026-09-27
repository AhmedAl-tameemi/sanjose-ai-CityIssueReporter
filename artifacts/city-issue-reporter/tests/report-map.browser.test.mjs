import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium, devices, webkit } from "playwright-core";

const reporterDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const draftStorageKey = "city-issue-reporter-draft-v2";
const reportStorageKey = "city-issue-reporter-last-report";
const initialPoint = { lat: 37.3382, lng: -121.8863 };
const searchedPoint = { lat: 37.3349, lng: -121.8894 };
const streetAddress = "200 E Santa Clara St, San José, CA 95113";
const blankTile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cKJkAAAAASUVORK5CYII=",
  "base64",
);

let browser;
let webkitBrowser;
let server;
let baseUrl;
let serverOutput = "";

async function findAvailablePort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolveClose, reject) => {
    probe.close((error) => (error ? reject(error) : resolveClose()));
  });
  return address.port;
}

async function waitForServer(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before starting.\n${serverOutput}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The dev server is not listening yet.
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for Vite on port ${port}.\n${serverOutput}`);
}

before(async () => {
  const port = await findAvailablePort();
  baseUrl = `http://127.0.0.1:${port}/`;
  server = spawn(
    process.execPath,
    [
      resolve(reporterDirectory, "node_modules/vite/bin/vite.js"),
      "--config",
      "vite.config.ts",
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: reporterDirectory,
      env: { ...process.env, BASE_PATH: "/", NODE_ENV: "test", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });
  await waitForServer(port);

  const executablePath =
    process.env.CHROMIUM_PATH ??
    execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const originalLibraryPath = process.env.LD_LIBRARY_PATH;
  const webkitExecutablePath = process.env.WEBKIT_PATH ?? webkit.executablePath();
  const webkitLibraryPaths = [originalLibraryPath, process.env.REPLIT_LD_LIBRARY_PATH];
  if (process.env.WEBKIT_EXTRA_LIBRARY_PATH) {
    webkitLibraryPaths.push(process.env.WEBKIT_EXTRA_LIBRARY_PATH);
  }
  if (process.env.REPLIT_LD_LIBRARY_PATH) {
    try {
      const atomicLibrary = execFileSync("gcc", ["-print-file-name=libatomic.so.1"], {
        encoding: "utf8",
      }).trim();
      if (atomicLibrary !== "libatomic.so.1") {
        webkitLibraryPaths.push(resolve(atomicLibrary, ".."));
      }
    } catch {
      // Some Replit environments already expose libatomic in their library path.
    }
  }
  if (process.env.REPLIT_LD_LIBRARY_PATH) {
    process.env.LD_LIBRARY_PATH = webkitLibraryPaths.filter(Boolean).join(":");
  }
  try {
    webkitBrowser = await webkit.launch({
      executablePath: process.env.REPLIT_LD_LIBRARY_PATH
        ? resolve(reporterDirectory, "tests/webkit-launcher.sh")
        : webkitExecutablePath,
      env: {
        ...process.env,
        PLAYWRIGHT_WEBKIT_EXECUTABLE: webkitExecutablePath,
      },
      headless: true,
    });
  } finally {
    if (originalLibraryPath === undefined) {
      delete process.env.LD_LIBRARY_PATH;
    } else {
      process.env.LD_LIBRARY_PATH = originalLibraryPath;
    }
  }
}, { timeout: 120_000 });

after(async () => {
  await browser?.close();
  await webkitBrowser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => {
      server.once("exit", resolveExit);
      setTimeout(resolveExit, 3_000).unref();
    });
  }
});

async function openReport({
  touchEnabled = false,
  reverseLookupFails = false,
  browserInstance = browser,
  device,
} = {}) {
  const page = await browserInstance.newPage(
    device ?? {
      viewport: touchEnabled ? { width: 390, height: 844 } : { width: 1440, height: 1200 },
      isMobile: touchEnabled,
      hasTouch: touchEnabled,
    },
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: blankTile }),
  );
  await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
    const url = new URL(route.request().url());
    if (reverseLookupFails && url.pathname.endsWith("/reverse")) {
      await route.abort("failed");
      return;
    }
    const result = url.pathname.endsWith("/search")
      ? [
          {
            lat: String(searchedPoint.lat),
            lon: String(searchedPoint.lng),
            display_name: streetAddress,
            address: { house_number: "200", road: "E Santa Clara St", city: "San José" },
          },
        ]
      : { lat: "37.3382", lon: "-121.8863", display_name: "San José" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.goto(baseUrl);
  await page.getByTestId("select-language").selectOption("en");
  await page.getByTestId("map-pin").waitFor({ state: "visible" });
  return page;
}

async function dragPin(page) {
  const pin = page.getByTestId("map-pin");
  const bounds = await pin.boundingBox();
  assert.ok(bounds, "The map pin should have a visible browser bounding box");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 78,
    bounds.y + bounds.height / 2 + 46,
    { steps: 10 },
  );
  await page.mouse.up();
  await waitForDroppedPin(page);
  return readDraft(page);
}

async function dragPinWithTouch(page) {
  const pin = page.getByTestId("map-pin");
  await pin.scrollIntoViewIfNeeded();
  const bounds = await pin.boundingBox();
  assert.ok(bounds, "The map pin should have a visible browser bounding box");
  const startX = bounds.x + bounds.width / 2;
  const startY = bounds.y + bounds.height / 2;
  const client = await page.context().newCDPSession(page);

  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: startX, y: startY }],
    });
    for (let step = 1; step <= 10; step += 1) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            id: 1,
            x: startX + (78 * step) / 10,
            y: startY + (46 * step) / 10,
          },
        ],
      });
      await delay(16);
    }
  } finally {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await client.detach();
  }

  await waitForDroppedPin(page);
  return readDraft(page);
}

async function dragPinWithWebKitTouch(page) {
  const pin = page.getByTestId("map-pin");
  await pin.scrollIntoViewIfNeeded();
  const bounds = await pin.boundingBox();
  assert.ok(bounds, "The map pin should have a visible browser bounding box");
  const startX = bounds.x + bounds.width / 2;
  const startY = bounds.y + bounds.height / 2;

  await page.evaluate(async ({ startX, startY }) => {
    const target = document.elementFromPoint(startX, startY);
    if (!target) throw new Error("Could not find the map pin at the touch start point");
    const makeTouch = (x, y) => document.createTouch(
      window,
      target,
      1,
      x,
      y,
      x,
      y,
      x,
      y,
      1,
      1,
      0,
      1,
    );
    const dispatch = (type, x, y, active) => {
      const touch = makeTouch(x, y);
      const activeTouches = active ? document.createTouchList(touch) : document.createTouchList();
      const event = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: document.createTouchList(touch),
      });
      target.dispatchEvent(event);
    };

    dispatch("touchstart", startX, startY, true);
    for (let step = 1; step <= 10; step += 1) {
      dispatch(
        "touchmove",
        startX + (78 * step) / 10,
        startY + (46 * step) / 10,
        true,
      );
      await new Promise(requestAnimationFrame);
    }
    dispatch("touchend", startX + 78, startY + 46, false);
  }, { startX, startY });

  await waitForDroppedPin(page);
  return readDraft(page);
}

async function waitForDroppedPin(page) {
  await page.waitForFunction(
    (key) => {
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      return (
        Number.isFinite(draft.pinLatitude) &&
        Number.isFinite(draft.pinLongitude) &&
        Boolean(draft.location) &&
        draft.searchedAddress === ""
      );
    },
    draftStorageKey,
  );
}

async function readDraft(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
    draftStorageKey,
  );
}

async function readSavedReport(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    reportStorageKey,
  );
}

async function waitForPinAtMapCenter(page) {
  await page.waitForFunction(
    () => {
      const map = document.querySelector('[data-testid="map-location"]');
      const pin = document.querySelector('[data-testid="map-pin"]');
      if (!map || !pin) return false;
      const mapBounds = map.getBoundingClientRect();
      const pinBounds = pin.getBoundingClientRect();
      const anchorX = pinBounds.left + pinBounds.width / 2;
      const anchorY = pinBounds.bottom;
      return (
        Math.abs(anchorX - (mapBounds.left + mapBounds.width / 2)) < 2 &&
        Math.abs(anchorY - (mapBounds.top + mapBounds.height / 2)) < 2
      );
    },
    undefined,
    { timeout: 10_000 },
  );
}

async function fillStepTwo(page) {
  await page.getByTestId("input-date").fill("2026-09-27");
  await page.getByTestId("input-approximate-time").fill("Around noon");
  await page
    .getByTestId("input-description")
    .fill("A large pothole has formed beside the curb.");
  await page.getByTestId("select-frequency").selectOption("One time");
  await page.getByTestId("button-continue").click();
  await page.getByTestId("button-submit-report").waitFor({ state: "visible" });
}

test("a visible draggable pin supports pin-only submission with coordinates intact", async () => {
  const page = await openReport();
  try {
    const pin = page.getByTestId("map-pin");
    await waitForPinAtMapCenter(page);
    assert.match(await pin.getAttribute("class"), /leaflet-marker-draggable/);

    await page.getByTestId("button-issue-potholes").click();
    const selectedPoint = await dragPin(page);
    assert.ok(selectedPoint.location.startsWith("Dropped map pin"));
    assert.notDeepEqual(
      { lat: selectedPoint.pinLatitude, lng: selectedPoint.pinLongitude },
      initialPoint,
    );

    await page.getByTestId("button-continue").click();
    await fillStepTwo(page);
    await page.getByTestId("button-submit-report").click();
    await page.locator(".confirmation-card").waitFor({ state: "visible" });

    const report = await readSavedReport(page);
    assert.equal(report.searchedAddress, "");
    assert.equal(report.pinLatitude, selectedPoint.pinLatitude);
    assert.equal(report.pinLongitude, selectedPoint.pinLongitude);
  } finally {
    await page.close();
  }
});

test("a failed reverse lookup preserves a dropped pin through report submission", async () => {
  const page = await openReport({ reverseLookupFails: true });
  try {
    await page.getByTestId("button-issue-potholes").click();
    const failedReverseLookup = page.waitForEvent("requestfailed", {
      predicate: (request) =>
        new URL(request.url()).pathname.endsWith("/reverse"),
    });
    const selectedPoint = await dragPin(page);
    await failedReverseLookup;

    assert.ok(selectedPoint.location.startsWith("Dropped map pin"));
    assert.equal(selectedPoint.searchedAddress, "");
    assert.notDeepEqual(
      { lat: selectedPoint.pinLatitude, lng: selectedPoint.pinLongitude },
      initialPoint,
    );

    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").waitFor({ state: "visible" });
    await fillStepTwo(page);
    await page.getByTestId("button-submit-report").click();
    await page.locator(".confirmation-card").waitFor({ state: "visible" });

    const report = await readSavedReport(page);
    assert.ok(report.location.startsWith("Dropped map pin"));
    assert.equal(report.searchedAddress, "");
    assert.equal(report.pinLatitude, selectedPoint.pinLatitude);
    assert.equal(report.pinLongitude, selectedPoint.pinLongitude);
  } finally {
    await page.close();
  }
});

test("touchscreen residents can move the pin and submit without an address", async () => {
  const page = await openReport({ touchEnabled: true });
  try {
    assert.deepEqual(
      await page.evaluate(() => ({
        width: window.innerWidth,
        hasTouch: navigator.maxTouchPoints > 0 || "ontouchstart" in window,
      })),
      { width: 390, hasTouch: true },
    );

    await page.getByTestId("button-issue-potholes").click();
    const selectedPoint = await dragPinWithTouch(page);
    assert.ok(selectedPoint.location.startsWith("Dropped map pin"));
    assert.equal(selectedPoint.searchedAddress, "");
    assert.notDeepEqual(
      { lat: selectedPoint.pinLatitude, lng: selectedPoint.pinLongitude },
      initialPoint,
    );

    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").waitFor({ state: "visible" });
    await fillStepTwo(page);
    await page.getByTestId("button-submit-report").click();
    await page.locator(".confirmation-card").waitFor({ state: "visible" });

    const report = await readSavedReport(page);
    assert.equal(report.searchedAddress, "");
    assert.equal(report.pinLatitude, selectedPoint.pinLatitude);
    assert.equal(report.pinLongitude, selectedPoint.pinLongitude);
  } finally {
    await page.close();
  }
});

test("iPhone Safari residents can move the pin and submit without an address", async () => {
  const page = await openReport({
    browserInstance: webkitBrowser,
    device: devices["iPhone 15"],
  });
  try {
    const browserContext = await page.evaluate(() => ({
      width: window.innerWidth,
      userAgent: navigator.userAgent,
      hasTouch: navigator.maxTouchPoints > 0 || "ontouchstart" in window,
    }));
    assert.equal(browserContext.width, 393);
    assert.equal(browserContext.hasTouch, true);
    assert.match(browserContext.userAgent, /iPhone/);
    assert.match(browserContext.userAgent, /Safari/);

    await page.getByTestId("button-issue-potholes").click();
    const selectedPoint = await dragPinWithWebKitTouch(page);
    assert.ok(selectedPoint.location.startsWith("Dropped map pin"));
    assert.equal(selectedPoint.searchedAddress, "");
    assert.notDeepEqual(
      { lat: selectedPoint.pinLatitude, lng: selectedPoint.pinLongitude },
      initialPoint,
    );

    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").waitFor({ state: "visible" });
    await fillStepTwo(page);
    await page.getByTestId("button-submit-report").click();
    await page.locator(".confirmation-card").waitFor({ state: "visible" });

    const report = await readSavedReport(page);
    assert.equal(report.searchedAddress, "");
    assert.equal(report.pinLatitude, selectedPoint.pinLatitude);
    assert.equal(report.pinLongitude, selectedPoint.pinLongitude);
  } finally {
    await page.close();
  }
});

test("Android Chrome residents can move the pin and submit without an address", async () => {
  const page = await openReport({
    browserInstance: browser,
    device: devices["Pixel 7"],
  });
  try {
    const browserContext = await page.evaluate(() => ({
      width: window.innerWidth,
      userAgent: navigator.userAgent,
      hasTouch: navigator.maxTouchPoints > 0 || "ontouchstart" in window,
    }));
    assert.equal(browserContext.width, 412);
    assert.equal(browserContext.hasTouch, true);
    assert.match(browserContext.userAgent, /Android/);
    assert.match(browserContext.userAgent, /Pixel 7/);

    await page.getByTestId("button-issue-potholes").click();
    const selectedPoint = await dragPinWithTouch(page);
    assert.ok(selectedPoint.location.startsWith("Dropped map pin"));
    assert.equal(selectedPoint.searchedAddress, "");
    assert.notDeepEqual(
      { lat: selectedPoint.pinLatitude, lng: selectedPoint.pinLongitude },
      initialPoint,
    );

    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").waitFor({ state: "visible" });
    await fillStepTwo(page);
    await page.getByTestId("button-submit-report").click();
    await page.locator(".confirmation-card").waitFor({ state: "visible" });

    const report = await readSavedReport(page);
    assert.equal(report.searchedAddress, "");
    assert.equal(report.pinLatitude, selectedPoint.pinLatitude);
    assert.equal(report.pinLongitude, selectedPoint.pinLongitude);
  } finally {
    await page.close();
  }
});

test("saving and reloading a draft restores the selected map pin", async () => {
  const page = await openReport();
  try {
    await page.getByTestId("button-issue-potholes").click();
    const selectedPoint = await dragPin(page);

    await page.getByTestId("button-continue").click();
    await fillStepTwo(page);
    await page.getByTestId("button-save-later").click();
    await page.reload();
    await page.getByTestId("map-pin").waitFor({ state: "visible" });

    const restoredDraft = await readDraft(page);
    assert.equal(restoredDraft.pinLatitude, selectedPoint.pinLatitude);
    assert.equal(restoredDraft.pinLongitude, selectedPoint.pinLongitude);
    assert.match(
      await page.getByTestId("map-pin").getAttribute("class"),
      /leaflet-marker-draggable/,
    );
    await waitForPinAtMapCenter(page);
  } finally {
    await page.close();
  }
});

test("street address search moves the pin and allows Step 1 to continue", async () => {
  const page = await openReport();
  try {
    await page.getByTestId("button-issue-potholes").click();
    await page.getByTestId("input-location").fill(streetAddress);
    await page.getByTestId("button-search-address").click();
    await page.waitForFunction(
      ({ key, address }) => {
        const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
        return (
          draft.searchedAddress === address &&
          draft.pinLatitude === 37.3349 &&
          draft.pinLongitude === -121.8894
        );
      },
      { key: draftStorageKey, address: streetAddress },
    );

    const searchedDraft = await readDraft(page);
    assert.equal(searchedDraft.location, streetAddress);
    assert.equal(searchedDraft.pinLatitude, searchedPoint.lat);
    assert.equal(searchedDraft.pinLongitude, searchedPoint.lng);
    await waitForPinAtMapCenter(page);

    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").waitFor({ state: "visible" });
  } finally {
    await page.close();
  }
});