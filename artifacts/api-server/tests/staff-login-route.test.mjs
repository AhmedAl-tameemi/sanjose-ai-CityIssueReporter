import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import express from "express";
import cookieParser from "cookie-parser";

test("durable staff PIN limits across processes, restarts, trusted proxies, and store failures", async () => {
  assert.ok(process.env.DATABASE_URL, "Route integration tests require the development PostgreSQL database");
  const directory = await mkdtemp(join(tmpdir(), "traffic-staff-route-"));
  const bundle = join(directory, "staff.cjs");
  const schema = `staff_login_test_${randomUUID().replaceAll("-", "")}`;
  await build({
    stdin: {
      contents: `
        export { createStaffRouter } from "./src/routes/staff";
        export { default as reportsRouter } from "./src/routes/reports";
        export { PostgresStaffAttemptStore } from "./src/lib/staffAttemptStore";
        export { StaffLoginRateLimiter, staffClientKey } from "./src/lib/staffLoginRateLimit";
        export { configureTrustedProxy } from "./src/lib/trustedProxy";
        export { pool } from "@workspace/db";
      `,
      resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts",
    },
    outfile: bundle, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
  });
  const api = createRequire(import.meta.url)(bundle);
  const admin = api.pool;
  const databases = [];
  const servers = [];
  const children = [];
  const sharedPin = "0042";
  process.env.SESSION_SECRET = "unit-test-signing-secret-not-for-production";
  delete process.env.CITY_STAFF_PIN;

  async function start(trusted, failing = false) {
    const database = new admin.constructor({
      connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`,
    });
    databases.push(database);
    const store = failing ? { locked: async () => { throw new Error("fixture outage"); } } : new api.PostgresStaffAttemptStore(database);
    const app = express();
    api.configureTrustedProxy(app, trusted);
    app.use(express.json(), cookieParser());
    app.use("/api", api.createStaffRouter(new api.StaffLoginRateLimiter(store)));
    app.use("/api", api.reportsRouter);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}/api/staff`;
  }

  async function startProcess() {
    const child = spawn(process.execPath, ["-e", `
      const api = require(process.argv[1]);
      const express = require(process.argv[3]);
      const database = new api.pool.constructor({
        connectionString: process.env.DATABASE_URL, options: "-c search_path=" + process.argv[2]
      });
      const app = express();
      api.configureTrustedProxy(app, "127.0.0.1/32");
      app.use(express.json());
      app.use("/api", api.createStaffRouter(new api.StaffLoginRateLimiter(new api.PostgresStaffAttemptStore(database))));
      const server = app.listen(0, "127.0.0.1", () => process.send(server.address().port));
      process.on("SIGTERM", () => { server.closeAllConnections(); server.close(async () => { await database.end(); await api.pool.end(); process.exit(0); }); });
    `, bundle, schema, createRequire(import.meta.url).resolve("express")], {
      env: { ...process.env, CITY_STAFF_PIN: sharedPin },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    children.push(child);
    const port = await Promise.race([
      once(child, "message").then(([value]) => value),
      once(child, "exit").then(([code]) => { throw new Error(`Staff test server exited: ${code}`); }),
    ]);
    return { child, base: `http://127.0.0.1:${port}/api/staff` };
  }
  const login = (base, body, forwarding = "203.0.113.1", extra = {}) => fetch(`${base}/login`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": forwarding, ...extra },
    body: JSON.stringify(body),
  });
  const stop = async (child) => {
    const closed = once(child, "exit");
    child.kill("SIGTERM");
    await closed;
  };

  try {
    // Isolated schema: no application counters, resident data, or real credentials are changed.
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE TABLE ${schema}.staff_login_attempts (
      client_key text PRIMARY KEY, failures integer NOT NULL, expires_at timestamptz NOT NULL
    )`);
    const base = await start("");
    assert.equal((await login(base, { pin: "0042" })).status, 503);
    process.env.CITY_STAFF_PIN = sharedPin;
    for (const body of [{ email: "fixture@example.invalid", password: "fixture" }, { pin: 42 }, { pin: "123" }, { pin: "12345" }]) {
      assert.equal((await login(base, body)).status, 400);
    }
    const denied = await login(base, { pin: "1111" });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("set-cookie"), null);
    const signedIn = await login(base, { pin: "0042" });
    assert.equal(signedIn.status, 200);
    assert.deepEqual(await signedIn.json(), { authenticated: true, staffId: "city-officials", role: "city-evidence-reviewer" });
    const setCookie = signedIn.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly; SameSite=Lax/);
    const cookie = setCookie.split(";")[0];
    const session = await fetch(`${base}/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).staffId, "city-officials");
    const reportsBase = base.replace(/\/staff$/, "");
    assert.equal((await fetch(`${reportsBase}/reports?view=staff`)).status, 401);
    assert.equal((await fetch(`${reportsBase}/reports?view=staff`, { headers: { Cookie: `${cookie}tampered` } })).status, 401);
    const fullHistory = await fetch(`${reportsBase}/reports?view=staff`, { headers: { Cookie: cookie } });
    assert.equal(fullHistory.status, 200);
    assert.equal((await fullHistory.json()).viewer, "staff");
    const personalHistory = await fetch(`${reportsBase}/reports?view=resident`, { headers: { Cookie: cookie } });
    const personal = await personalHistory.json();
    assert.equal(personal.viewer, "resident");
    assert.equal(personal.reports.length, 0);
    const evidenceUrl = `${reportsBase}/staff/reports/00000000-0000-4000-8000-000000000001/evidence/0`;
    assert.equal((await fetch(evidenceUrl)).status, 401);
    assert.equal((await fetch(evidenceUrl, { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await login(base, { pin: "0042" }).then((r) => r.json())).staffId, "city-officials");
    const logout = await fetch(`${base}/logout`, { method: "POST", headers: { Cookie: cookie } });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await fetch(`${base}/session`)).status, 401);
    for (let n = 0; n < 5; n++) {
      // No trusted proxy configured: every supplied header is ignored.
      const response = await login(base, { pin: "1111" }, `203.0.113.${n + 1}`, {
        "X-Real-IP": `198.51.100.${n + 1}`, Forwarded: `for=198.51.100.${n + 1}`,
      });
      assert.equal(response.status, n < 4 ? 401 : 429);
      if (n === 4) assert.ok(Number(response.headers.get("retry-after")) >= 899);
    }
    assert.equal((await login(base, { pin: "0042" }, "203.0.113.99")).status, 429);

    // Two independent Node servers/pools, then a genuine process replacement.
    const first = await startProcess();
    const second = await startProcess();
    const client = "198.51.100.42";
    for (let n = 0; n < 3; n++) assert.equal((await login(first.base, { pin: "1111" }, client)).status, 401);
    await stop(first.child);
    const restarted = await startProcess();
    const results = await Promise.all(Array.from({ length: 20 }, (_, n) =>
      login(n % 2 ? restarted.base : second.base, { pin: "1111" }, `203.0.113.${n + 1}, ${client}`)));
    assert.equal(results.filter((response) => response.status === 401).length, 1);
    assert.equal(results.filter((response) => response.status === 429).length, 19);
    assert.ok(results.every((response) => response.headers.get("set-cookie") === null));
    const counts = await admin.query(`SELECT failures FROM ${schema}.staff_login_attempts WHERE client_key = $1`, [api.staffClientKey(client)]);
    assert.equal(counts.rows[0].failures, 5);
    assert.equal((await login(restarted.base, { pin: "0042" }, `203.0.113.200, ${client}`)).status, 429);
    assert.equal((await login(second.base, { pin: "0042" }, "198.51.100.43")).status, 200);
    await stop(restarted.child);
    const afterCooldownRestart = await startProcess();
    assert.equal((await login(afterCooldownRestart.base, { pin: "0042" }, client)).status, 429);
    // Shared-clock expiry and honest remaining-time response.
    await admin.query(`UPDATE ${schema}.staff_login_attempts SET expires_at = clock_timestamp() + interval '61 seconds' WHERE client_key = $1`, [api.staffClientKey(client)]);
    const cooling = await login(second.base, { pin: "0042" }, client);
    assert.ok(Number(cooling.headers.get("retry-after")) <= 61);
    assert.ok(Number(cooling.headers.get("retry-after")) > 0);
    assert.ok((await cooling.json()).error.includes(`${Math.ceil(Number(cooling.headers.get("retry-after")) / 60)} minute`));
    await admin.query(`UPDATE ${schema}.staff_login_attempts SET expires_at = clock_timestamp() - interval '1 second' WHERE client_key = $1`, [api.staffClientKey(client)]);
    assert.equal((await login(afterCooldownRestart.base, { pin: "0042" }, client)).status, 200);

    const unavailable = await start("", true);
    const failure = await login(unavailable, { pin: "0042" });
    assert.equal(failure.status, 503);
    assert.equal(failure.headers.get("set-cookie"), null);
    assert.match((await failure.json()).error, /temporarily unavailable/);

    // Explicit topology may include multiple verified relays (preview/published).
    const multiHop = await start("127.0.0.1/32,10.1.2.3/32");
    for (let n = 0; n < 5; n++) {
      assert.equal((await login(multiHop, { pin: "1111" }, `192.0.2.${n + 1}, 198.51.100.88, 10.1.2.3`)).status, n < 4 ? 401 : 429);
    }
    assert.equal((await login(multiHop, { pin: "0042" }, "198.51.100.89, 10.1.2.3")).status, 200);
    // A short path terminates at its actual client, not at a fixed hop index.
    assert.equal((await login(multiHop, { pin: "0042" }, "198.51.100.89")).status, 200);
    for (const bad of ["true", "*", "0.0.0.0/0", "::/0", "10.0.0.1/33", "not-an-ip"]) {
      assert.throws(() => api.configureTrustedProxy(express(), bad));
    }
    const pruningDb = databases[0];
    await admin.query(`UPDATE ${schema}.staff_login_attempts SET expires_at = clock_timestamp() - interval '2 days' WHERE client_key = $1`, [api.staffClientKey("198.51.100.88")]);
    await new api.PostgresStaffAttemptStore(pruningDb).prune();
    assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${schema}.staff_login_attempts WHERE client_key = $1`, [api.staffClientKey("198.51.100.88")])).rows[0].count, 0);
    assert.equal((await login(base, { pin: "0042" })).status, 429);
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) await stop(child);
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    for (const database of databases) await database.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
