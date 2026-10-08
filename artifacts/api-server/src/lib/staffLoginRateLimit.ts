type Attempts = { failures: number; expiresAt: number };

/** Small, server-side cooldown. No PINs or staff IDs are kept in this map. */
export class StaffLoginRateLimiter {
  private attempts = new Map<string, Attempts>();
  private maxFailures: number;
  private cooldownMs: number;

  constructor(maxFailures = 5, cooldownMs = 15 * 60 * 1000) {
    this.maxFailures = maxFailures;
    this.cooldownMs = cooldownMs;
  }

  retryAfter(key: string, now = Date.now()): number {
    const entry = this.attempts.get(key);
    if (!entry) return 0;
    if (entry.expiresAt <= now) {
      this.attempts.delete(key);
      return 0;
    }
    return entry.failures >= this.maxFailures ? Math.ceil((entry.expiresAt - now) / 1000) : 0;
  }

  failure(key: string, now = Date.now()): number {
    // Prune expired entries so the limiter cannot accumulate stale clients.
    for (const [client, entry] of this.attempts) {
      if (entry.expiresAt <= now) this.attempts.delete(client);
    }
    const entry = this.attempts.get(key) ?? { failures: 0, expiresAt: now + this.cooldownMs };
    entry.failures += 1;
    if (entry.failures === this.maxFailures) entry.expiresAt = now + this.cooldownMs;
    this.attempts.set(key, entry);
    return this.retryAfter(key, now);
  }

  success(key: string): void {
    this.attempts.delete(key);
  }
}
