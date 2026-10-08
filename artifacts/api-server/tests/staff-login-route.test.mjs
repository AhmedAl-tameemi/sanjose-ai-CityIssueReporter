import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import express from "express";
import cookieParser from "cookie-parser";

test("PIN login, individual sessions, logout, malformed input, and guessing limits work over HTTP", async () => {
  // This server contains only the staff router and synthetic test credentials.
  // It never connects to the application's database or private resident files.
  process.env.SESSION_SECRET = "unit-test-signing-secret-not-for-production";
  delete process.env.CITY_STAFF_PIN_CREDENTIALS;
  const directory = await mkdtemp(join(tmpdir(), "traffic-staff-route-"));
  const bundle = join(directory, "staff.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/routes/staff.ts", import.meta.url))],
    outfile: bundle, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
  });
  const router = createRequire(import.meta.url)(bundle).default;
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/staff`;
  const login = (body, forwarding = "203.0.113.1") => fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": forwarding },
    body: JSON.stringify(body),
  });
  try {
    assert.equal((await login({ pin: "0042" })).status, 503);
    process.env.CITY_STAFF_PIN_CREDENTIALS = JSON.stringify({ "staff-a": "0042", "staff-b": "9317" });
    for (const body of [{ email: "fixture@example.invalid", password: "fixture" }, { pin: 42 }, { pin: "123" }, { pin: "12345" }]) {
      assert.equal((await login(body)).status, 400);
    }
    const denied = await login({ pin: "1111" });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("set-cookie"), null);
    const signedIn = await login({ pin: "0042" });
    assert.equal(signedIn.status, 200);
    assert.deepEqual(await signedIn.json(), { authenticated: true, staffId: "staff-a", role: "city-evidence-reviewer" });
    const setCookie = signedIn.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly; SameSite=Lax/);
    const cookie = setCookie.split(";")[0];
    const session = await fetch(`${base}/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).staffId, "staff-a");
    assert.equal((await login({ pin: "9317" }).then((r) => r.json())).staffId, "staff-b");
    const logout = await fetch(`${base}/logout`, { method: "POST", headers: { Cookie: cookie } });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await fetch(`${base}/session`)).status, 401);
    for (let n = 0; n < 5; n++) {
      // Caller-controlled forwarding headers cannot bypass the peer cooldown.
      const response = await login({ pin: "1111" }, `203.0.113.${n + 1}`);
      assert.equal(response.status, n < 4 ? 401 : 429);
      if (n === 4) assert.equal(Number(response.headers.get("retry-after")), 900);
    }
    assert.equal((await login({ pin: "0042" }, "203.0.113.99")).status, 429);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
