import { pgTable, text, timestamp, doublePrecision, integer, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cityAccidentProvenance = {
  sourceType: "public_dataset",
  sourceUrl: "https://data.sanjoseca.gov/dataset/crash-locations-last-five-years",
  originalDocumentsImported: false,
  isSynthetic: false,
} as const;

// Official public City records only, never resident submissions or evidence.
export const cityAccidentsTable = pgTable("city_accidents", {
  id: text("id").primaryKey(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  year: text("year").notNull(),
  location: text("location").notNull(),
  collisionType: text("collision_type").notNull(),
  severity: text("severity").notNull(),
  sourceType: text("source_type").notNull().default(cityAccidentProvenance.sourceType),
  sourceUrl: text("source_url").notNull().default(cityAccidentProvenance.sourceUrl),
  originalDocumentsImported: boolean("original_documents_imported").notNull().default(false),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("city_accidents_type_idx").on(table.collisionType, table.id),
  index("city_accidents_date_idx").on(table.occurredAt, table.id),
  index("city_accidents_year_idx").on(table.year),
]);

export const cityAccidentSyncTable = pgTable("city_accident_sync", {
  id: text("id").primaryKey(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  sourceCount: integer("source_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
});
export const insertCityAccidentSchema = createInsertSchema(cityAccidentsTable);
export type InsertCityAccident = z.infer<typeof insertCityAccidentSchema>;
export type CityAccident = typeof cityAccidentsTable.$inferSelect;
