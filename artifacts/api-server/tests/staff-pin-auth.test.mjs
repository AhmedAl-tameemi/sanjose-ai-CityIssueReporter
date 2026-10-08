import assert from "node:assert/strict";
import { test } from "node:test";
import { createStaffSession, getStaffSession, isStaffAuthConfigured, verifyStaffPin } from "../src/lib/staffAuth.ts";
import { StaffLoginRateLimiter } from "../src/lib/staffLoginRateLimit.ts";

// Synthetic fixtures, not credentials for the running application.
process.env.SESSION_SECRET = "unit-test-signing-secret-not-for-production";
const configure = () => {
  process.env.CITY_STAFF_PIN_CREDENTIALS = JSON.stringify({ "staff-a": "0042", "staff-b": "9317" });
};
const request = (token) => ({ cookies: { city_staff_session: token }, header: () => undefined });

test("four-digit PINs identify distinct staff, preserve leading zeroes, and need no email", () => {
  configure();
  assert.equal(isStaffAuthConfigured(), true);
  assert.equal(verifyStaffPin("0042"), "staff-a");
  assert.equal(verifyStaffPin("9317"), "staff-b");
  for (const pin of ["42", "00042", " 0042", "0042 ", "abcd", "1111"]) {
    assert.equal(verifyStaffPin(pin), null);
  }
});

test("missing, invalid, and duplicate PIN configuration fails closed", () => {
  for (const configuration of ["", "bad JSON", "[]", "{}", '{"staff-a":42}', '{"staff-a":"0042","staff-b":"0042"}']) {
    process.env.CITY_STAFF_PIN_CREDENTIALS = configuration;
    assert.equal(isStaffAuthConfigured(), false);
    assert.equal(verifyStaffPin("0042"), null);
  }
});

test("sessions contain individual staff identity and expire when a PIN is rotated or removed", () => {
  configure();
  const token = createStaffSession("staff-a");
  assert.equal(getStaffSession(request(token))?.staffId, "staff-a");
  assert.equal(getStaffSession(request(`${token}tampered`)), null);
  process.env.CITY_STAFF_PIN_CREDENTIALS = JSON.stringify({ "staff-a": "1122", "staff-b": "9317" });
  assert.equal(getStaffSession(request(token)), null);
  process.env.CITY_STAFF_PIN_CREDENTIALS = JSON.stringify({ "staff-b": "9317" });
  assert.equal(getStaffSession(request(token)), null);
});

test("five failed guesses cause a 15-minute cooldown, isolated from other clients", () => {
  const limiter = new StaffLoginRateLimiter();
  const now = 1000;
  for (let n = 0; n < 4; n++) assert.equal(limiter.failure("client-a", now), 0);
  assert.equal(limiter.failure("client-a", now), 900);
  assert.equal(limiter.retryAfter("client-a", now + 1000), 899);
  assert.equal(limiter.retryAfter("client-b", now + 1000), 0);
  assert.equal(limiter.retryAfter("client-a", now + 900000), 0);
  assert.equal(limiter.failure("client-a", now + 900000), 0);
  limiter.success("client-a");
  assert.equal(limiter.retryAfter("client-a", now + 900001), 0);
});
