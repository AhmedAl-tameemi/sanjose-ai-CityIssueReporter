import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// No PIN, staff identity, or raw client address is stored here.
export const staffLoginAttemptsTable = pgTable("staff_login_attempts", {
  clientKey: text("client_key").primaryKey(),
  failures: integer("failures").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("staff_login_attempts_expiry_idx").on(table.expiresAt)]);

export const insertStaffLoginAttemptSchema = createInsertSchema(staffLoginAttemptsTable);
export type StaffLoginAttempt = typeof staffLoginAttemptsTable.$inferSelect;
