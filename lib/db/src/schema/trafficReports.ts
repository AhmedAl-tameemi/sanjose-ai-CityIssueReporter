import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type TrafficReportOriginal = {
  issueType: string;
  location: string | null;
  searchedAddress: string | null;
  pinLatitude: number | null;
  pinLongitude: number | null;
  date: string;
  approximateTime: string;
  description: string;
  frequency: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type TrafficReportEvidence = {
  name: string;
  type: string;
  size: number;
};

export type TrafficReportAnalysis = {
  summary: string;
  urgency: "low" | "medium" | "high";
  suggestedCategory: string;
  recommendedAction: string;
};

export type TrafficReportTranslation = {
  location: string;
  approximateTime: string;
  description: string;
};

export const trafficReportsTable = pgTable(
  "traffic_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    clientSubmissionId: uuid("client_submission_id").notNull(),
    reportNumber: text("report_number").notNull().unique(),
    category: text("category").notNull(),
    location: text("location"),
    originalReport: jsonb("original_report")
      .$type<TrafficReportOriginal>()
      .notNull(),
    evidence: jsonb("evidence").$type<TrafficReportEvidence | null>(),
    analysis: jsonb("analysis").$type<TrafficReportAnalysis | null>(),
    analysisStatus: text("analysis_status")
      .$type<"pending" | "complete" | "unavailable">()
      .notNull()
      .default("pending"),
    status: text("status").notNull().default("submitted"),
    language: text("language").notNull().default("en"),
    englishTranslation: jsonb("english_translation").$type<TrafficReportTranslation | null>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("traffic_reports_owner_submission_idx").on(
      table.ownerId,
      table.clientSubmissionId,
    ),
    index("traffic_reports_submitted_at_idx").on(table.submittedAt),
    index("traffic_reports_owner_submitted_at_idx").on(
      table.ownerId,
      table.submittedAt,
    ),
  ],
);

export type TrafficReportRecord = typeof trafficReportsTable.$inferSelect;