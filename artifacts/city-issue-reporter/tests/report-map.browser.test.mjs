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
  await page.goto(`${baseUrl}?view=report`);
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

async function fillStepTwo(page, description = "A large pothole has formed beside the curb.") {
  await page
    .getByTestId("input-date")
    .fill(await browserLocalDate(page));
  await page.getByTestId("input-approximate-time").fill("Around noon");
  await page.getByTestId("input-description").fill(description);
  await page.getByTestId("select-frequency").selectOption("One time");
  await page.getByTestId("button-continue").click();
  const continueWithReport = page.getByTestId("button-continue-with-report");
  if (await continueWithReport.isVisible()) {
    await continueWithReport.click();
    await page.getByTestId("button-continue").click();
  }
  await page.getByTestId("button-submit-report").waitFor({ state: "visible" });
}

async function browserLocalDate(page, daysFromToday = 0) {
  return page.evaluate((days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, daysFromToday);
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

test("phone landscape residents can use the map and keep pin coordinates through submission", async () => {
  const page = await openReport({
    device: {
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    },
  });
  try {
    assert.deepEqual(
      await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        hasTouch: navigator.maxTouchPoints > 0 || "ontouchstart" in window,
      })),
      { width: 844, height: 390, hasTouch: true },
    );

    await page.getByTestId("button-issue-potholes").click();
    const map = page.getByTestId("map-location");
    await map.scrollIntoViewIfNeeded();

    const mapBounds = await map.boundingBox();
    assert.ok(mapBounds, "The landscape map should have a visible browser bounding box");
    assert.ok(mapBounds.height <= 175, "The map should use the compact landscape height");

    for (const control of [".leaflet-control-zoom-in", ".leaflet-control-zoom-out"]) {
      const controlBounds = await page.locator(control).boundingBox();
      assert.ok(controlBounds, `${control} should have a visible browser bounding box`);
      assert.ok(controlBounds.x >= mapBounds.x);
      assert.ok(controlBounds.y >= mapBounds.y);
      assert.ok(controlBounds.x + controlBounds.width <= mapBounds.x + mapBounds.width);
      assert.ok(controlBounds.y + controlBounds.height <= mapBounds.y + mapBounds.height);
      assert.ok(controlBounds.y >= 0 && controlBounds.y + controlBounds.height <= 390);
      await page.locator(control).click();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await waitForPinAtMapCenter(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await waitForPinAtMapCenter(page);
    await map.scrollIntoViewIfNeeded();

    const selectedPoint = await dragPinWithTouch(page);
    assert.ok(selectedPoint.location.startsWith("Dropped map pin"));
    assert.equal(selectedPoint.searchedAddress, "");
    assert.notDeepEqual(
      { lat: selectedPoint.pinLatitude, lng: selectedPoint.pinLongitude },
      initialPoint,
    );

    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").waitFor({ state: "visible" });
    const continuedDraft = await readDraft(page);
    assert.equal(continuedDraft.pinLatitude, selectedPoint.pinLatitude);
    assert.equal(continuedDraft.pinLongitude, selectedPoint.pinLongitude);

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

test("future notice dates are rejected while today's date remains valid", async () => {
  const page = await openReport();
  try {
    await page.getByTestId("button-issue-potholes").click();
    await dragPin(page);
    await page.getByTestId("button-continue").click();

    const dateInput = page.getByTestId("input-date");
    const today = await browserLocalDate(page);
    const tomorrow = await browserLocalDate(page, 1);
    assert.equal(await dateInput.getAttribute("max"), today);

    await dateInput.fill(tomorrow);
    await page.getByTestId("input-approximate-time").fill("Around noon");
    await page
      .getByTestId("input-description")
      .fill("A large pothole has formed beside the curb.");
    await page.getByTestId("select-frequency").selectOption("One time");
    await page.getByTestId("button-continue").click();

    assert.equal(await dateInput.getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator("#date-error").innerText(), "Choose today or an earlier date.");
    assert.equal(await page.getByTestId("input-description").isVisible(), true);

    await dateInput.fill(today);
    await page.getByTestId("button-continue").click();
    await page.getByTestId("button-submit-report").waitFor({ state: "visible" });
  } finally {
    await page.close();
  }
});

test("residents can drop a photo onto the photo evidence field", async () => {
  const page = await openReport();
  try {
    await page.getByTestId("button-issue-potholes").click();
    await dragPin(page);
    await page.getByTestId("button-continue").click();
    await fillStepTwo(page);

    await page.route("**/api/storage/evidence**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            objectPath: "/objects/evidence/123e4567-e89b-12d3-a456-426614174000",
            contentType: "image/png",
            size: blankTile.length,
            previewToken: "browser-test-preview",
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "image/png", body: blankTile });
    });

    const addPhotoButton = page.getByTestId("button-add-evidence");
    assert.equal(await addPhotoButton.innerText(), "Choose a photo");
    assert.equal(await page.getByText("Or drop a photo here.").isVisible(), true);

    const dropzone = page.getByTestId("photo-dropzone");
    await dropzone.evaluate((element) => {
      const transfer = new DataTransfer();
      const binary = atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cKJkAAAAASUVORK5CYII=",
      );
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], "curb-photo.png", { type: "image/png" }));
      window.reportPhotoTransfer = transfer;
      element.dispatchEvent(new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
      element.dispatchEvent(new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
    });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="photo-dropzone"]')?.classList.contains("is-dragging"),
    );

    await dropzone.evaluate((element) => {
      element.dispatchEvent(new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: window.reportPhotoTransfer,
      }));
    });
    await page.waitForFunction((key) => {
      const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
      return draft.evidence?.name === "curb-photo.png";
    }, draftStorageKey);

    const draft = await readDraft(page);
    assert.equal(draft.evidence.type, "image/png");
    assert.equal(draft.evidence.objectPath, "/objects/evidence/123e4567-e89b-12d3-a456-426614174000");
    assert.equal(await addPhotoButton.innerText(), "Replace photo");
  } finally {
    await page.close();
  }
});

test("confirmation acknowledges a described non-emergency safety risk", async () => {
  const page = await openReport();
  try {
    await page.getByTestId("button-issue-potholes").click();
    await dragPin(page);
    await page.getByTestId("button-continue").click();
    await fillStepTwo(page, "The sidewalk is blocked, so wheelchair users have to enter traffic.");
    await page.getByTestId("button-submit-report").click();
    await page.locator(".confirmation-card").waitFor({ state: "visible" });

    const riskMessage = page.getByTestId("confirmation-safety-serious");
    const message = await riskMessage.innerText();
    assert.match(message, /blocked access/i);
    assert.match(message, /response times are not guaranteed/i);
    assert.equal(await page.getByTestId("link-confirmation-call-911").count(), 0);
  } finally {
    await page.close();
  }
});

test("confirmation directs residents describing immediate danger to call 911", async () => {
  const page = await openReport();
  try {
    await page.getByTestId("button-issue-potholes").click();
    await dragPin(page);
    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").fill(await browserLocalDate(page));
    await page.getByTestId("input-approximate-time").fill("Right now");
    await page.getByTestId("input-description").fill(
      "A person is unconscious and not breathing after a car hit them.",
    );
    await page.getByTestId("select-frequency").selectOption("One time");
    await page.getByTestId("safety-escalation").waitFor({ state: "visible" });
    await page.getByTestId("button-continue-with-report").click();
    await page.getByTestId("button-continue").click();
    await page.getByTestId("button-submit-report").waitFor({ state: "visible" });
    await page.getByTestId("button-submit-report").click();
    await page.locator(".confirmation-card").waitFor({ state: "visible" });

    const emergencyMessage = page.getByTestId("confirmation-safety-immediate");
    assert.match(await emergencyMessage.innerText(), /isn't monitored for emergencies/i);
    assert.equal(
      await page.getByTestId("link-confirmation-call-911").getAttribute("href"),
      "tel:911",
    );
  } finally {
    await page.close();
  }
});

test("urgent Spanish descriptions show emergency guidance before report submission", async () => {
  const page = await openReport();
  try {
    await page.getByTestId("select-language").selectOption("es");
    await page.getByTestId("button-issue-potholes").click();
    await dragPin(page);
    await page.getByTestId("button-continue").click();
    await page.getByTestId("input-date").fill(await browserLocalDate(page));
    await page.getByTestId("input-approximate-time").fill("Ahora");
    await page.getByTestId("input-description").fill(
      "Hay una emergencia médica y alguien no puede respirar.",
    );
    await page.getByTestId("select-frequency").selectOption("One time");

    const safetyAlert = page.getByTestId("safety-escalation");
    await safetyAlert.waitFor({ state: "visible" });
    assert.match(await safetyAlert.innerText(), /Llama al 911/i);
  } finally {
    await page.close();
  }
});