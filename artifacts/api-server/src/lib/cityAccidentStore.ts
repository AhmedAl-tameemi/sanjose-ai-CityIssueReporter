import { db, pool, cityAccidentsTable, cityAccidentSyncTable, cityAccidentProvenance } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { mapCityFeature, query as queryCitySource } from "./cityIncidents";

const sourceId = "san-jose";
const week = 7 * 24 * 60 * 60_000;
const retryDelay = 15 * 60_000;
const fields = "OBJECTID,CRASHDATETIMEUTC,YEAR,INTASTREETNAME,INTBSTREETNAME,COLLISIONTYPE,FATALINJURIES,SEVEREINJURIES,MODERATEINJURIES,MINORINJURIES";
let pending: Promise<void> | undefined;

// Data import only. Schema creation is handled by development schema push and
// the managed Publish flow, never by runtime DDL.
export function ensureCityAccidentsSynced(): Promise<void> {
  if (pending) return pending;
  pending = refreshIfNeeded().finally(() => { pending = undefined; });
  return pending;
}

async function refreshIfNeeded(): Promise<void> {
  const [previous] = await db.select().from(cityAccidentSyncTable).where(eq(cityAccidentSyncTable.id, sourceId));
  if (previous?.lastSyncedAt && previous.status === "ready" && Date.now() - previous.lastSyncedAt.getTime() < week) return;
  if (previous?.status === "error" && previous.lastAttemptAt && Date.now() - previous.lastAttemptAt.getTime() < retryDelay) return;

  // Session lock prevents duplicate imports across server instances. PostgreSQL
  // releases the lock if the instance terminates during an import.
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(79823111) AS acquired");
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return;
    const [current] = await db.select().from(cityAccidentSyncTable).where(eq(cityAccidentSyncTable.id, sourceId));
    if (current?.lastSyncedAt && current.status === "ready" && Date.now() - current.lastSyncedAt.getTime() < week) return;
    if (current?.status === "error" && current.lastAttemptAt && Date.now() - current.lastAttemptAt.getTime() < retryDelay) return;
    await db.insert(cityAccidentSyncTable).values({
      id: sourceId, status: "syncing", lastAttemptAt: new Date(),
    }).onConflictDoUpdate({
      target: cityAccidentSyncTable.id,
      set: { status: "syncing", lastAttemptAt: new Date() },
    });
    const snapshot = await queryCitySource({ where: "1=1", returnIdsOnly: "true" });
    const ids = snapshot.objectIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200_000 ||
      !ids.every((id) => Number.isSafeInteger(id) && id >= 0) || new Set(ids).size !== ids.length) {
      throw new Error("City accident identifier snapshot was invalid.");
    }
    const records: NonNullable<ReturnType<typeof mapCityFeature>>[] = [];
    let skippedCount = 0;
    // Fetch the full public dataset, sequentially and in bounded batches.
    // No narrative, demographics, evidence, or private reports are downloaded.
    for (let offset = 0; offset < ids.length; offset += 1000) {
      const batch = ids.slice(offset, offset + 1000);
      const result = await queryCitySource({
        objectIds: batch.join(","), outFields: fields,
        returnGeometry: "true", outSR: "4326",
      }, "POST");
      const expected = new Set(batch.map(String));
      if (!Array.isArray(result.features) || result.features.length !== batch.length ||
        new Set(result.features.map((f) => String(f.attributes?.OBJECTID))).size !== batch.length ||
        !result.features.every((f) => expected.has(String(f.attributes?.OBJECTID)))) {
        throw new Error("City accident import was incomplete. Previous database records were preserved.");
      }
      for (const feature of result.features) {
        const record = mapCityFeature(feature);
        if (record && /^20\d{2}$/.test(record.year)) records.push(record);
        else skippedCount++;
      }
    }
    if (!records.length) throw new Error("City accident import contained no usable records.");
    const syncedAt = new Date();
    // Commit a complete snapshot atomically, with source-id upserts to avoid
    // duplicates. Historical saved records are not deleted on source rotation.
    await db.transaction(async (tx) => {
      for (let offset = 0; offset < records.length; offset += 500) {
        await tx.insert(cityAccidentsTable).values(records.slice(offset, offset + 500).map((record) => ({
          ...record, ...cityAccidentProvenance,
          occurredAt: record.occurredAt ? new Date(record.occurredAt) : null, importedAt: syncedAt,
        }))).onConflictDoUpdate({
          target: cityAccidentsTable.id,
          set: {
            ...cityAccidentProvenance,
            latitude: sql`excluded.latitude`, longitude: sql`excluded.longitude`,
            occurredAt: sql`excluded.occurred_at`, year: sql`excluded.year`,
            location: sql`excluded.location`, collisionType: sql`excluded.collision_type`,
            severity: sql`excluded.severity`, importedAt: syncedAt,
          },
        });
      }
      await tx.update(cityAccidentSyncTable).set({
        status: "ready", lastSyncedAt: syncedAt, sourceCount: ids.length, skippedCount,
      }).where(eq(cityAccidentSyncTable.id, sourceId));
    });
  } catch (error) {
    if (locked) {
      await db.update(cityAccidentSyncTable).set({ status: "error" })
        .where(eq(cityAccidentSyncTable.id, sourceId));
    }
    throw error;
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(79823111)");
    } finally { client.release(); }
  }
}
