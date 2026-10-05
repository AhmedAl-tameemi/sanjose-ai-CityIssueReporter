import test from "node:test";
import assert from "node:assert/strict";
import { ListCityAccidentsQueryParams } from "../../../lib/api-zod/src/generated/api.ts";

test("accident list defaults to whole-dataset accident-type sorting", () => {
  assert.deepEqual(ListCityAccidentsQueryParams.parse({}), {
    page: 1, pageSize: 25, sort: "type", order: "asc", year: "all",
  });
});

test("accident list accepts bounded pagination, exact type filters, and date sorting", () => {
  const params = ListCityAccidentsQueryParams.parse({
    page: "2", pageSize: "50", sort: "date", order: "desc", year: "2024", accidentType: "Rear End",
  });
  assert.equal(params.page, 2);
  assert.equal(params.pageSize, 50);
  assert.equal(params.accidentType, "Rear End");
  assert.equal(params.sort, "date");
});

test("invalid ordering, unbounded pages, and malformed years are rejected", () => {
  for (const params of [
    { page: "0" }, { page: "1.5" }, { pageSize: "101" }, { page: "100001" },
    { sort: "type; DROP TABLE city_accidents" }, { order: "sideways" },
    { year: "2024' OR 1=1" }, { accidentType: "x".repeat(151) },
  ]) {
    assert.equal(ListCityAccidentsQueryParams.safeParse(params).success, false);
  }
});
