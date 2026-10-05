import test from "node:test";
import assert from "node:assert/strict";
import { mapCityFeature, parseMapBounds } from "../src/lib/cityIncidents.ts";

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
