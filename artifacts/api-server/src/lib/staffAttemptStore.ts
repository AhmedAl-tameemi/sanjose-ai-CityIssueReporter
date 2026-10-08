import { pool } from "@workspace/db";
import type { AttemptState, StaffAttemptStore } from "./staffLoginRateLimit";

export class PostgresStaffAttemptStore implements StaffAttemptStore {
  constructor(private database = pool) {}

  async locked<T>(key: string, decide: (state: AttemptState, now: number) => T): Promise<T> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      // Limits apply to the whole transaction, not a process-local queue.
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await client.query(
        `INSERT INTO staff_login_attempts (client_key, failures, expires_at)
         VALUES ($1, 0, to_timestamp(0))
         ON CONFLICT (client_key) DO UPDATE SET client_key = EXCLUDED.client_key
         RETURNING failures, expires_at`,
        [key],
      );
      // Read the shared database clock AFTER obtaining the row lock.
      const clock = await client.query("SELECT clock_timestamp() AS now");
      const state = {
        failures: result.rows[0].failures,
        expiresAt: result.rows[0].expires_at.getTime(),
      };
      const decision = decide(state, clock.rows[0].now.getTime());
      await client.query(
        "UPDATE staff_login_attempts SET failures = $2, expires_at = $3 WHERE client_key = $1",
        [key, state.failures, new Date(state.expiresAt)],
      );
      await client.query("COMMIT");
      return decision;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async prune(): Promise<void> {
    // Bounded cleanup, never delete live counters or wait on an active login.
    await this.database.query(
      `DELETE FROM staff_login_attempts WHERE client_key IN (
         SELECT client_key FROM staff_login_attempts
         WHERE expires_at < clock_timestamp() - interval '1 day'
         LIMIT 1000 FOR UPDATE SKIP LOCKED
       )`,
    );
  }
}
