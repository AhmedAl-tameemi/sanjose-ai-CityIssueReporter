// Only public, explicitly selected City attributes are exposed. This module
// does not access resident reports, evidence, contact details, or narratives.
const service = "https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/553/query";
export const sourceUrl = "https://data.sanjoseca.gov/dataset/crash-locations-last-five-years";
export const incidentLimit = 1000;
const cacheTtl = 5 * 60_000;
const maxCacheEntries = 50;

export type IncidentSeverity = "fatal" | "severe" | "injury" | "none" | "unknown";
export type IncidentFilters = {
  bbox: string;
  year: string;
  severity: "all" | Exclude<IncidentSeverity, "unknown">;
};

type Feature = { attributes?: Record<string, unknown>; geometry?: { x?: unknown; y?: unknown } };
type CityRecord = {
  id: string;
  latitude: number;
  longitude: number;
  occurredAt: string | null;
  year: string;
  location: string;
  collisionType: string;
  severity: IncidentSeverity;
};
type QueryResult = { features?: Feature[]; count?: number; objectIds?: number[]; error?: unknown };
type MapResult = {
  incidents: CityRecord[];
  totalMatched: number;
  limit: number;
  truncated: boolean;
  unmappedCount: number;
  availableYears: string[];
  fetchedAt: string;
  sourceName: string;
  sourceUrl: string;
};

export function parseMapBounds(value: string): number[] | null {
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((p) => !p.trim())) return null;
  const [west, south, east, north] = parts.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west! < -180 || east! > 180 || south! < -90 || north! > 90) return null;
  if (west! >= east! || south! >= north! || east! - west! > 4 || north! - south! > 4) return null;
  return [west!, south!, east!, north!];
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function mapCityFeature(feature: Feature): CityRecord | null {
  const a = feature.attributes;
  const latitude = feature.geometry?.y;
  const longitude = feature.geometry?.x;
  if (!a || count(a.OBJECTID) === null || typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const injuries = [a.FATALINJURIES, a.SEVEREINJURIES, a.MODERATEINJURIES, a.MINORINJURIES].map(count);
  const severity: IncidentSeverity = (injuries[0] ?? 0) > 0 ? "fatal"
    : (injuries[1] ?? 0) > 0 ? "severe"
    : (injuries[2] ?? 0) + (injuries[3] ?? 0) > 0 ? "injury"
    : injuries.every((n) => n === 0) ? "none" : "unknown";
  const date = typeof a.CRASHDATETIMEUTC === "number" ? new Date(a.CRASHDATETIMEUTC) : null;
  const occurredAt = date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  const text = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 150) : "";
  return {
    id: String(a.OBJECTID),
    latitude,
    longitude,
    occurredAt,
    year: text(a.YEAR),
    location: [text(a.INTASTREETNAME), text(a.INTBSTREETNAME)].filter(Boolean).join(" & ") || "Intersection not specified",
    collisionType: text(a.COLLISIONTYPE) || "Not specified",
    severity,
  };
}

export async function query(params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<QueryResult> {
  const url = new URL(service);
  const encoded = new URLSearchParams({ f: "json", ...params });
  if (method === "GET") url.search = encoded.toString();
  const response = await fetch(url, {
    method, body: method === "POST" ? encoded : undefined,
    signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("City data HTTP request failed.");
  const data = await response.json() as QueryResult;
  if (!data || typeof data !== "object" || data.error) throw new Error("City data query failed.");
  return data;
}

let yearsCache: { data: string[]; expires: number } | undefined;
let yearsPending: Promise<string[]> | undefined;
async function getYears(): Promise<string[]> {
  if (yearsCache && yearsCache.expires > Date.now()) return yearsCache.data;
  if (yearsPending) return yearsPending;
  yearsPending = query({
    where: "1=1", outFields: "YEAR", returnGeometry: "false",
    returnDistinctValues: "true", orderByFields: "YEAR DESC",
  }).then((data) => {
    if (!Array.isArray(data.features)) throw new Error("City year metadata was malformed.");
    const years = [...new Set(data.features.map((f) => f.attributes?.YEAR)
      .filter((year): year is string => typeof year === "string" && /^20\d{2}$/.test(year)))].sort().reverse();
    if (!years.length) throw new Error("City year metadata was empty.");
    yearsCache = { data: years, expires: Date.now() + 60 * 60_000 };
    return years;
  }).finally(() => { yearsPending = undefined; });
  return yearsPending;
}

const cache = new Map<string, { data: MapResult; expires: number }>();
const pending = new Map<string, Promise<MapResult>>();
const failures = new Map<string, number>();

export async function getCityIncidents(filters: IncidentFilters): Promise<MapResult> {
  const bounds = parseMapBounds(filters.bbox);
  if (!bounds || !/^(all|20\d{2})$/.test(filters.year)) throw new Error("Invalid map filters.");
  const key = JSON.stringify(filters);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  if ((failures.get(key) ?? 0) > Date.now()) throw new Error("City data temporarily unavailable.");
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 8) throw new Error("City data requests are busy. Try again shortly.");
  // A bounded cache and coalesced requests protect the public City service.
  const request = (async () => {
    const [west, south, east, north] = bounds;
    const severityWhere = {
      all: "",
      fatal: "FATALINJURIES > 0",
      severe: "(FATALINJURIES = 0 OR FATALINJURIES IS NULL) AND SEVEREINJURIES > 0",
      injury: "(FATALINJURIES = 0 OR FATALINJURIES IS NULL) AND (SEVEREINJURIES = 0 OR SEVEREINJURIES IS NULL) AND (MODERATEINJURIES > 0 OR MINORINJURIES > 0)",
      none: "FATALINJURIES = 0 AND SEVEREINJURIES = 0 AND MODERATEINJURIES = 0 AND MINORINJURIES = 0",
    }[filters.severity];
    const clauses = ["1=1"];
    if (filters.year !== "all") clauses.push(`YEAR = '${filters.year}'`);
    if (severityWhere) clauses.push(`(${severityWhere})`);
    const common = {
      where: clauses.join(" AND "),
      geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    };
    const [features, totals, years] = await Promise.all([
      query({
        ...common, outFields: "OBJECTID,CRASHDATETIMEUTC,YEAR,INTASTREETNAME,INTBSTREETNAME,COLLISIONTYPE,FATALINJURIES,SEVEREINJURIES,MODERATEINJURIES,MINORINJURIES",
        returnGeometry: "true", outSR: "4326", resultRecordCount: String(incidentLimit),
        orderByFields: "CRASHDATETIMEUTC DESC,OBJECTID DESC",
      }),
      query({ ...common, returnCountOnly: "true" }),
      getYears(),
    ]);
    if (!Array.isArray(features.features) || count(totals.count) === null) throw new Error("City data response was malformed.");
    const incidents = features.features.map(mapCityFeature).filter((i): i is CityRecord => Boolean(i));
    const result: MapResult = {
      incidents, totalMatched: totals.count!, limit: incidentLimit,
      truncated: totals.count! > features.features.length,
      unmappedCount: features.features.length - incidents.length,
      availableYears: years, fetchedAt: new Date().toISOString(),
      sourceName: "City of San José · Crash Locations Last Five Years", sourceUrl,
    };
    if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value!);
    cache.set(key, { data: result, expires: Date.now() + cacheTtl });
    failures.delete(key);
    return result;
  })().catch((error) => {
    if (failures.size >= maxCacheEntries) failures.delete(failures.keys().next().value!);
    failures.set(key, Date.now() + 10_000);
    throw error;
  }).finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}
