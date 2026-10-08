import assert from "node:assert/strict";
import { test } from "node:test";
import { createStaffSession, getStaffSession, isStaffAuthConfigured, verifyStaffPin } from "../src/lib/staffAuth.ts";
import { StaffLoginRateLimiter, staffClientKey } from "../src/lib/staffLoginRateLimit.ts";

// Synthetic fixtures, not credentials for the running application.
process.env.SESSION_SECRET = "unit-test-signing-secret-not-for-production";
const configure = () => {
  process.env.CITY_STAFF_PIN = "0042";
};
const request = (token) => ({ cookies: { city_staff_session: token }, header: () => undefined });

test("one shared four-digit PIN preserves leading zeroes and needs no email", () => {
  configure();
  assert.equal(isStaffAuthConfigured(), true);
  assert.equal(verifyStaffPin("0042"), "city-officials");
  for (const pin of ["42", "00042", " 0042", "0042 ", "abcd", "1111", "9317"]) {
    assert.equal(verifyStaffPin(pin), null);
  }
});

test("missing or malformed shared PIN configuration fails closed", () => {
  delete process.env.CITY_STAFF_PIN;
  assert.equal(isStaffAuthConfigured(), false);
  for (const configuration of ["", "bad JSON", "42", "00042", " 0042", "0042 ", '{"staff-a":"0042"}']) {
    process.env.CITY_STAFF_PIN = configuration;
    assert.equal(isStaffAuthConfigured(), false);
    assert.equal(verifyStaffPin("0042"), null);
  }
});

test("sessions use a shared identity and are invalidated when the PIN is changed or removed", () => {
  configure();
  const token = createStaffSession("city-officials");
  assert.equal(getStaffSession(request(token))?.staffId, "city-officials");
  assert.throws(() => createStaffSession("staff-a"));
  assert.equal(getStaffSession(request(`${token}tampered`)), null);
  process.env.CITY_STAFF_PIN = "1122";
  assert.equal(getStaffSession(request(token)), null);
  delete process.env.CITY_STAFF_PIN;
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
