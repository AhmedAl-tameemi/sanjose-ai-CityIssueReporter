import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import express from "express";
import cookieParser from "cookie-parser";

test("public staff reports and saved attachments need no PIN; resident lists and raw previews stay scoped", async () => {
  const directory = await mkdtemp(join(tmpdir(), "traffic-public-reports-"));
  const bundle = join(directory, "reports.cjs");
  await build({
    stdin: {
      contents: `
        export { default as reportsRouter } from "./src/routes/reports";
        export { default as storageRouter } from "./src/routes/storage";
        export { getResidentOwnerId } from "./src/lib/staffAuth";
        export { pool } from "@workspace/db";
      `,
      resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts",
    },
    outfile: bundle, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
    plugins: [{
      name: "fixture-evidence-storage",
      setup(plugin) {
        plugin.onResolve({ filter: /\/objectStorage$/ }, () => ({ path: "fixture-storage", namespace: "fixture" }));
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          loader: "js",
          contents: `
            export class ObjectNotFoundError extends Error {}
            export class ObjectStorageService {
              async getObjectEntityFile(path) { return { path }; }
              async downloadObject() { return new Response("fixture attachment", { headers: { "Content-Type": "image/png" } }); }
            }
          `,
        }));
      },
    }],
  });
  process.env.SESSION_SECRET = "public-report-test-session-secret-long-enough";
  const api = createRequire(import.meta.url)(bundle);
  api.pool.options.max = 1;
  let cookie;
  const ownerId = api.getResidentOwnerId({ cookies: {}, headers: {} }, {
    cookie(name, value) { cookie = `${name}=${value}`; },
    append(_name, value) { cookie = value.split(";")[0]; },
  });
  const ids = [randomUUID(), randomUUID()];
  let server;
  try {
    // Temporary tables shadow the real table only on this test connection.
    // No live report is inserted, updated, or removed.
    await api.pool.query("CREATE TEMP TABLE traffic_reports (LIKE public.traffic_reports INCLUDING DEFAULTS)");
    for (let index = 0; index < ids.length; index++) {
      const original = {
        issueType: "Unsafe driving", location: "Fixture intersection", searchedAddress: null,
        pinLatitude: null, pinLongitude: null, date: "2026-10-07", approximateTime: "8:30 AM",
        description: "Fixture resident statement.", frequency: "Happens every day",
        name: "Fixture Resident", email: "fixture@example.invalid", phone: null,
      };
      await api.pool.query(`
        INSERT INTO traffic_reports
        (id, owner_id, client_submission_id, report_number, category, location, original_report, evidence, analysis_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unavailable')
      `, [ids[index], index === 0 ? ownerId : randomUUID(), randomUUID(),
        `FIXTURE-${index}`, original.issueType, original.location, JSON.stringify(original),
        JSON.stringify([{ name: "fixture.png", type: "image/png", size: 18, objectPath: "/evidence/fixture-object" }])]);
    }
    const app = express();
    app.use(express.json(), cookieParser());
    app.use((req, _res, next) => { req.log = { error() {}, warn() {} }; next(); });
    app.use("/api", api.reportsRouter, api.storageRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const publicList = await fetch(`${base}/reports?view=staff`);
    assert.equal(publicList.status, 200);
    const staff = await publicList.json();
    assert.equal(staff.viewer, "staff");
    assert.equal(staff.reports.length, 2);
    assert.equal(staff.reports[0].originalReport.email, "fixture@example.invalid");
    assert.equal(JSON.stringify(staff).includes("fixture-object"), false);
    const savedEvidence = await fetch(`${base}/staff/reports/${ids[1]}/evidence/0`);
    assert.equal(savedEvidence.status, 200);
    assert.equal(await savedEvidence.text(), "fixture attachment");
    const resident = await fetch(`${base}/reports?view=resident`, { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.equal(resident.viewer, "resident");
    assert.deepEqual(resident.reports.map((r) => r.id), [ids[0]]);
    const freshResident = await fetch(`${base}/reports`).then((r) => r.json());
    assert.equal(freshResident.reports.length, 0);
    assert.equal((await fetch(`${base}/reports/${ids[1]}/evidence/0`, { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await fetch(`${base}/storage/objects/evidence/fixture-object`)).status, 401);
    assert.equal((await fetch(`${base}/staff/reports/${randomUUID()}/evidence/0`)).status, 404);
    assert.equal((await fetch(`${base}/staff/login`, { method: "POST" })).status, 404);
  } finally {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await api.pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
