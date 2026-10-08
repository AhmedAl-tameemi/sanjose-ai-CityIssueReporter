import assert from "node:assert/strict";
import { test } from "node:test";
import { createStaffSession, getStaffSession, isStaffAuthConfigured, verifyStaffPin } from "../src/lib/staffAuth.ts";
import { StaffLoginRateLimiter, staffClientKey } from "../src/lib/staffLoginRateLimit.ts";

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

test("cooldown uses the store clock, expires, resets on success, and blocks even correct PINs", async () => {
  let now = 1000;
  const states = new Map();
  const store = { async locked(key, decide) {
    const state = states.get(key) ?? { failures: 0, expiresAt: 0 };
    states.set(key, state);
    return decide(state, now);
  }};
  const limiter = new StaffLoginRateLimiter(store);
  for (let n = 0; n < 4; n++) assert.equal((await limiter.attempt("client-a", () => null)).retryAfter, 0);
  assert.equal((await limiter.attempt("client-a", () => null)).retryAfter, 900);
  now += 1000;
  assert.equal((await limiter.attempt("client-a", () => { assert.fail("must not verify while blocked"); })).retryAfter, 899);
  assert.equal((await limiter.attempt("client-b", () => "staff-b")).staffId, "staff-b");
  now += 899000;
  assert.equal((await limiter.attempt("client-a", () => "staff-a")).staffId, "staff-a");
  assert.equal(states.get(staffClientKey("client-a")).failures, 0);
});

test("address representations cannot create extra guessing budgets", () => {
  assert.equal(staffClientKey("192.0.2.1"), staffClientKey("::ffff:192.0.2.1"));
  assert.equal(staffClientKey("192.0.2.1"), staffClientKey("::ffff:c000:201"));
  assert.equal(staffClientKey("2001:DB8:0:0:0:0:0:1"), staffClientKey("2001:db8::1"));
});
