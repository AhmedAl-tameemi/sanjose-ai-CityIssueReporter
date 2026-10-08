import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildReportAnalysisInput, countSummarySentences, isConciseReportSummary } from "../src/lib/reportSummary.ts";

const original = {
  issueType: "unsafe_crossing", location: "Test Street and Test Avenue",
  searchedAddress: "Test intersection", pinLatitude: 37.33, pinLongitude: -121.88,
  date: "2026-10-07", approximateTime: "8:30 AM", frequency: "daily",
  description: "Drivers reportedly fail to yield at the crossing.",
  name: "Fixture Resident", email: "fixture@example.invalid", phone: "fixture-phone",
};
const evidence = [{ type: "image/png", name: "private-filename.png", size: 200, objectPath: "private-object-path" }];
const twoSentences = "A resident reported drivers failing to yield at the Test Street crossing. The issue reportedly occurs daily around 8:30 AM, and one photo was submitted.";
const baseFetch = globalThis.fetch;
let directory;
let api;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "traffic-summary-test-"));
  const bundle = join(directory, "analysis.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/reportAnalysis.ts", import.meta.url))],
    outfile: bundle, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
  });
  api = createRequire(import.meta.url)(bundle);
  process.env.OPENAI_API_KEY = "unit-test-api-key-not-real";
});

after(async () => {
  globalThis.fetch = baseFetch;
  await rm(directory, { recursive: true, force: true });
});

function mockProvider(summary) {
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      summary, urgency: "medium", suggestedCategory: "unsafe_crossing",
      recommendedAction: "Review the reported crossing conditions.",
    }) } }],
  }), { status: 200 });
}

test("concise report summaries require between two and five sentences", () => {
  assert.equal(countSummarySentences(twoSentences), 2);
  assert.equal(isConciseReportSummary(twoSentences), true);
  assert.equal(isConciseReportSummary("One sentence."), false);
  assert.equal(isConciseReportSummary("First. Second. Third. Fourth. Fifth."), true);
  assert.equal(isConciseReportSummary("First. Second. Third. Fourth. Fifth. Sixth."), false);
  assert.equal(isConciseReportSummary(""), false);
  assert.equal(isConciseReportSummary(null), false);
  assert.equal(isConciseReportSummary(`${"A".repeat(1201)}. Another sentence.`), false);
  assert.equal(countSummarySentences("A pothole is 2.5 metres wide. It was reported today."), 2);
});

test("summary input includes full incident context but excludes personal values and private media paths", () => {
  const input = buildReportAnalysisInput(original, evidence);
  assert.equal(input.location, original.location);
  assert.equal(input.searchedAddress, original.searchedAddress);
  assert.equal(input.date, original.date);
  assert.equal(input.approximateTime, original.approximateTime);
  assert.equal(input.frequency, original.frequency);
  assert.equal(input.description, original.description);
  assert.equal(input.followUpContactProvided, true);
  assert.deepEqual(input.attachments, { count: 1, types: ["image/png"] });
  const serialized = JSON.stringify(input);
  for (const value of [original.name, original.email, original.phone, evidence[0].name, evidence[0].objectPath]) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal("pinLatitude" in input, false);
  assert.equal("pinLongitude" in input, false);
});

test("AI generation requests a factual two-to-five-sentence summary and accepts valid output", async () => {
  let requestBody;
  mockProvider(twoSentences);
  const provider = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requestBody = JSON.parse(options.body);
    return provider(url, options);
  };
  const result = await api.generateReportAnalysis(original, evidence);
  assert.equal(result.summary, twoSentences);
  assert.match(requestBody.messages[0].content, /2 to 5 complete sentences/);
  assert.match(requestBody.messages[0].content, /not that their contents were reviewed/);
  assert.deepEqual(JSON.parse(requestBody.messages[1].content), buildReportAnalysisInput(original, evidence));
});

test("one-sentence and overlong AI outputs are rejected instead of presented as completed summaries", async () => {
  for (const summary of ["One sentence.", "First. Second. Third. Fourth. Fifth. Sixth."]) {
    mockProvider(summary);
    await assert.rejects(api.generateReportAnalysis(original, evidence), /invalid analysis/);
  }
});

test("missing AI configuration and provider errors are explicit failures, not invented summaries", async () => {
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(api.generateReportAnalysis(original, evidence), /not configured/);
  process.env.OPENAI_API_KEY = "unit-test-api-key-not-real";
  globalThis.fetch = async () => new Response("fixture failure", { status: 401 });
  await assert.rejects(api.generateReportAnalysis(original, evidence), (error) => error.status === 401);
  globalThis.fetch = async () => new Response("fixture failure", { status: 503 });
  await assert.rejects(api.generateReportAnalysis(original, evidence), (error) => error.status === 503);
});
