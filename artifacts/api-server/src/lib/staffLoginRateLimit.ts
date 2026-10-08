import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type AttemptState = { failures: number; expiresAt: number };
export type LoginDecision = { retryAfter: number; staffId: string | null };
export interface StaffAttemptStore {
  /** Must lock this key across ALL instances until the updated state is durable. */
  locked<T>(key: string, decide: (state: AttemptState, now: number) => T): Promise<T>;
}

/** Canonicalize addresses, including IPv4-mapped IPv6, before hashing the key. */
export function staffClientKey(address: string): string {
  let canonical = address.toLowerCase();
  if (isIP(canonical) === 6) {
    canonical = new URL(`http://[${canonical}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
    if (mapped) {
      const value = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
      canonical = [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
    }
  }
  return createHash("sha256").update(`staff-login:${canonical}`).digest("hex");
}

export class StaffLoginRateLimiter {
  private store: StaffAttemptStore;
  private maxFailures: number;
  private cooldownMs: number;

  constructor(store: StaffAttemptStore, maxFailures = 5, cooldownMs = 15 * 60 * 1000) {
    this.store = store;
    this.maxFailures = maxFailures;
    this.cooldownMs = cooldownMs;
  }

  async attempt(address: string, verify: () => string | null): Promise<LoginDecision> {
    return this.store.locked(staffClientKey(address), (state, now) => {
      if (state.expiresAt <= now) {
        state.failures = 0;
        state.expiresAt = now + this.cooldownMs;
      }
      if (state.failures >= this.maxFailures) {
        return { retryAfter: Math.ceil((state.expiresAt - now) / 1000), staffId: null };
      }
      // Verification and counter updates share the same lock: a concurrent
      // request cannot sneak another guess in between checking and incrementing.
      const staffId = verify();
      if (staffId) {
        state.failures = 0;
        state.expiresAt = now;
        return { retryAfter: 0, staffId };
      }
      state.failures += 1;
      if (state.failures === this.maxFailures) state.expiresAt = now + this.cooldownMs;
      return {
        retryAfter: state.failures >= this.maxFailures ? Math.ceil((state.expiresAt - now) / 1000) : 0,
        staffId: null,
      };
    });
  }
}
