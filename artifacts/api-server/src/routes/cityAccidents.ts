import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql, count } from "drizzle-orm";
import { db, cityAccidentsTable as accidents, cityAccidentSyncTable } from "@workspace/db";
import { ListCityAccidentsQueryParams, ListCityAccidentsResponse } from "@workspace/api-zod";
import { ensureCityAccidentsSynced } from "../lib/cityAccidentStore";
import { sourceUrl } from "../lib/cityIncidents";

const router: IRouter = Router();
router.get("/city-accidents", async (req, res): Promise<void> => {
  const parsed = ListCityAccidentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose valid accident list options." });
    return;
  }
  const { page = 1, pageSize = 25, sort = "type", order = "asc", accidentType, year = "all" } = parsed.data;
  try {
    void ensureCityAccidentsSynced().catch(() => req.log.warn("City accident synchronization failed; stored records remain available"));
    const conditions = [];
    if (accidentType) conditions.push(eq(accidents.collisionType, accidentType));
    if (year !== "all") conditions.push(eq(accidents.year, year));
    const where = and(...conditions);
    const primary = sort === "type" ? accidents.collisionType : accidents.occurredAt;
    const ordering = order === "asc" ? asc(primary) : desc(primary);
    const [rows, totals, types, years, sync] = await Promise.all([
      db.select().from(accidents).where(where)
        .orderBy(sql`${ordering} nulls last`, desc(accidents.occurredAt), asc(accidents.id))
        .limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(accidents).where(where),
      db.selectDistinct({ value: accidents.collisionType }).from(accidents).orderBy(asc(accidents.collisionType)),
      db.selectDistinct({ value: accidents.year }).from(accidents).orderBy(desc(accidents.year)),
      db.select().from(cityAccidentSyncTable).where(eq(cityAccidentSyncTable.id, "san-jose")),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json(ListCityAccidentsResponse.parse({
      incidents: rows.map(({ importedAt: _importedAt, ...row }) => ({
        ...row, occurredAt: row.occurredAt?.toISOString() ?? null,
      })),
      total: totals[0]?.value ?? 0, page, pageSize,
      accidentTypes: types.map((t) => t.value), availableYears: years.map((y) => y.value),
      lastSyncedAt: sync[0]?.lastSyncedAt?.toISOString() ?? null,
      syncStatus: sync[0]?.status ?? "pending",
      skippedCount: sync[0]?.skippedCount ?? 0, sourceUrl,
    }));
  } catch {
    req.log.warn("City accident database is temporarily unavailable");
    res.status(503).json({ error: "The accident database is temporarily unavailable. Please try again." });
  }
});
export default router;
