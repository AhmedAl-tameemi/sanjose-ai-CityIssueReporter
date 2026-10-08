import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canStaffReadEvidence,
  createStaffSession,
  getResidentOwnerId,
  getStaffSession,
} from "../src/lib/staffAuth.ts";

// A synthetic test fixture, never a real workspace credential.
process.env.SESSION_SECRET = "unit-test-signing-secret-not-for-production";
process.env.CITY_STAFF_PIN = "0042";

function residentRequest(cookies = {}) {
  const headers = [];
  const req = { cookies, header: () => undefined };
  const res = { append: (name, value) => headers.push([name, value]) };
  const ownerId = getResidentOwnerId(req, res);
  const token = headers[0]?.[1].split(";")[0].split("=").slice(1).join("=");
  return { ownerId, headers, token };
}

test("resident identity is private, persistent, and stable across requests", () => {
  const first = residentRequest();
  assert.match(first.ownerId, /^[a-f0-9-]{36}$/);
  assert.match(first.headers[0][1], /HttpOnly; SameSite=Strict/);
  assert.match(first.headers[0][1], /Max-Age=\d+; Path=\/api/);
  const next = residentRequest({ city_resident_owner: first.token });
  assert.equal(next.ownerId, first.ownerId);
  assert.equal(next.headers.length, 0);
});

test("different residents and forged cookies do not share an owner", () => {
  const first = residentRequest();
  assert.notEqual(residentRequest().ownerId, first.ownerId);
  assert.notEqual(
    residentRequest({ city_resident_owner: `${first.token}tampered` }).ownerId,
    first.ownerId,
  );
});

test("resident report cookies cannot grant staff access", () => {
  const resident = residentRequest();
  const session = getStaffSession({
    cookies: { city_staff_session: resident.token },
    header: () => undefined,
  });
  assert.equal(session, null);
  assert.equal(canStaffReadEvidence(session), false);
});

test("staff and resident token audiences remain isolated", () => {
  const staff = createStaffSession("city-officials");
  const request = { cookies: { city_staff_session: staff }, header: () => undefined };
  assert.equal(canStaffReadEvidence(getStaffSession(request)), true);
  const resident = residentRequest({ city_resident_owner: staff });
  assert.notEqual(resident.ownerId, "city-officials");
  assert.ok(resident.token);
});