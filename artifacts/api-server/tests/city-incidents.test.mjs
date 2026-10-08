import test from "node:test";
import assert from "node:assert/strict";
import { buildIncidentWhere, getCityIncidents, mapCityFeature, parseMapBounds } from "../src/lib/cityIncidents.ts";

test("map areas reject malformed, reversed, or unbounded queries", () => {
  assert.deepEqual(parseMapBounds("-122,37,-121.8,37.5"), [-122,37,-121.8,37.5]);
  for (const bounds of ["", "1,2,3", ",37,-121,38", "NaN,1,2,3", "-181,1,-180,2", "-122,38,-121,37", "-180,-90,180,90"]) {
    assert.equal(parseMapBounds(bounds), null);
  }
});

test("public markers exclude narratives, personal details, and report identifiers", () => {
  const mapped = mapCityFeature({
    geometry: { x: -121.9, y: 37.3 },
    attributes: {
      OBJECTID: 42, CRASHDATETIMEUTC: Date.parse("2025-01-01T12:00:00Z"), YEAR: "2025",
      INTASTREETNAME: "FIRST ST", INTBSTREETNAME: "SANTA CLARA ST", COLLISIONTYPE: "Rear End",
      FATALINJURIES: 0, SEVEREINJURIES: 1, MODERATEINJURIES: 0, MINORINJURIES: 0,
      NARRATIVE: "Never return this", AGERANGE: "Never return this", TCRNUMBER: "Never return this",
    },
  });
  assert.equal(mapped.severity, "severe");
  assert.equal(mapped.location, "FIRST ST & SANTA CLARA ST");
  assert.equal(mapped.occurredAt, "2025-01-01T12:00:00.000Z");
  assert.equal(JSON.stringify(mapped).includes("Never return this"), false);
  assert.equal(mapCityFeature({ attributes: { OBJECTID: 42 }, geometry: { x: 0, y: 91 } }), null);
});

test("missing injury counts remain unknown, not a no-injury claim", () => {
  assert.equal(mapCityFeature({ attributes: { OBJECTID: 1 }, geometry: { x: -121.9, y: 37.3 } }).severity, "unknown");
});

test("accident types combine with year and severity and escape City query literals", () => {
  assert.equal(buildIncidentWhere({ year: "all", severity: "all", accidentType: "all" }), "1=1");
  const where = buildIncidentWhere({ year: "2025", severity: "fatal", accidentType: "Rear End" });
  assert.equal(where, "1=1 AND YEAR = '2025' AND (FATALINJURIES > 0) AND COLLISIONTYPE = 'Rear End'");
  assert.equal(
    buildIncidentWhere({ year: "all", severity: "all", accidentType: "Driver's Turn" }),
    "1=1 AND COLLISIONTYPE = 'Driver''s Turn'",
  );
  assert.match(
    buildIncidentWhere({ year: "all", severity: "all", accidentType: "Not specified" }),
    /COLLISIONTYPE IS NULL/,
  );
  assert.throws(() => buildIncidentWhere({ year: "2025' OR 1=1", severity: "all", accidentType: "all" }));
  assert.throws(() => buildIncidentWhere({ year: "all", severity: "all", accidentType: "x".repeat(151) }));
});

test("the City query filters both markers and totals before applying the record cap", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const params = new URL(url).searchParams;
    requests.push(params);
    if (params.get("returnDistinctValues") === "true") {
      const field = params.get("outFields");
      const values = field === "YEAR" ? ["2025"] : ["Rear End", "Head On", "Not specified"];
      return new Response(JSON.stringify({ features: values.map((value) => ({ attributes: { [field]: value } })) }));
    }
    if (params.get("returnCountOnly") === "true") return new Response(JSON.stringify({ count: 1 }));
    return new Response(JSON.stringify({
      features: [{
        geometry: { x: -121.9, y: 37.3 },
        attributes: {
          OBJECTID: 52, YEAR: "2025", COLLISIONTYPE: "Rear End",
          FATALINJURIES: 0, SEVEREINJURIES: 0, MODERATEINJURIES: 0, MINORINJURIES: 0,
        },
      }],
    }));
  });
  const result = await getCityIncidents({
    bbox: "-122,37.1,-121.8,37.4", year: "all", severity: "all", accidentType: "Rear End",
  });
  const dataRequests = requests.filter((params) => params.has("geometry"));
  assert.equal(dataRequests.length, 2);
  for (const params of dataRequests) assert.equal(params.get("where"), "1=1 AND COLLISIONTYPE = 'Rear End'");
  assert.equal(dataRequests.find((params) => params.has("outFields")).get("resultRecordCount"), "1000");
  assert.deepEqual(result.availableTypes, ["Head On", "Not specified", "Rear End"]);
  assert.equal(result.totalMatched, 1);
  assert.equal(result.incidents[0].collisionType, "Rear End");
});
