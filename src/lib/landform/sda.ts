/**
 * USDA NRCS Soil Data Access (SDA) client for SSURGO. Keyless, US only. Latency has been 10-30 s per call, so results are
 * cached and saved. Server-side only.
 *
 * Endpoint: POST https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest  body {"query": "...", "format": "JSON+COLUMNNAME"}
 * Step 1 finds the map unit key (mukey) at the point (SDA_Get_Mukey_from_intersection_with_WktWgs84, WKT is lon lat).
 * Step 2 reads components with comppct_r >= 15 and their horizons for that mukey.
 */
import type { SdaRaw, SoilComponent, SoilHorizon } from "./types";

export const SDA_ENDPOINT = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";
export const SDA_TIMEOUT_MS = 90_000;
export const SDA_MIN_COMPONENT_PCT = 15;

export type SdaFetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class SdaError extends Error {}

export function mukeyQuery(lat: number, lon: number): string {
  return `SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon} ${lat})')`;
}

export function componentQuery(mukey: string): string {
  if (!/^\d+$/.test(mukey)) throw new SdaError(`Unexpected map unit key "${mukey}".`);
  return (
    "SELECT mu.mukey, mu.muname, c.cokey, c.compname, c.comppct_r, c.slope_r, c.drainagecl, c.hydgrp, c.taxclname, " +
    "h.hzname, h.hzdept_r, h.hzdepb_r, h.sandtotal_r, h.claytotal_r, h.silttotal_r, h.om_r, h.awc_r, h.kffact, h.ksat_r, h.ph1to1h2o_r " +
    "FROM mapunit mu INNER JOIN component c ON c.mukey=mu.mukey LEFT JOIN chorizon h ON h.cokey=c.cokey " +
    `WHERE mu.mukey='${mukey}' AND c.comppct_r>=${SDA_MIN_COMPONENT_PCT} ORDER BY c.comppct_r DESC, c.cokey, h.hzdept_r`
  );
}

export type SdaTable = { columns: string[]; rows: Array<Record<string, string | null>> };

/** Parse a JSON+COLUMNNAME body. An empty result (SDA returns an empty object or no Table) is a valid table with 0 rows. */
export function parseSdaTable(body: unknown): { ok: true; table: SdaTable } | { ok: false; message: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "The soil service returned something that is not a table." };
  const t = (body as { Table?: unknown }).Table;
  if (t === undefined) {
    if (Object.keys(body as object).length === 0) return { ok: true, table: { columns: [], rows: [] } };
    return { ok: false, message: "The soil service reply has no Table." };
  }
  if (!Array.isArray(t)) return { ok: false, message: "The soil service reply has a malformed Table." };
  if (t.length === 0) return { ok: true, table: { columns: [], rows: [] } };
  const header = t[0];
  if (!Array.isArray(header) || header.some((h) => typeof h !== "string")) return { ok: false, message: "The soil service reply has no column names." };
  const columns = header as string[];
  const rows: SdaTable["rows"] = [];
  for (const r of t.slice(1)) {
    if (!Array.isArray(r) || r.length !== columns.length) return { ok: false, message: "The soil service reply has a row that does not match its columns." };
    const rec: Record<string, string | null> = {};
    columns.forEach((c, i) => {
      const v = r[i];
      rec[c] = v === null || v === undefined || v === "" ? null : String(v);
    });
    rows.push(rec);
  }
  return { ok: true, table: { columns, rows } };
}

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type SoilParse =
  | { ok: true; mukey: string; muName: string; components: SoilComponent[] }
  | { ok: false; kind: "no-coverage" | "error"; message: string };

export const SDA_NO_COVERAGE_MESSAGE = "SSURGO soil maps cover the United States only, and the soil service returned no map unit for this point.";

/** Parse the two raw SDA responses (as stored in SdaRaw) into components and horizons. */
export function parseSoil(raw: Pick<SdaRaw, "mukeyResponse" | "componentResponse">): SoilParse {
  const mk = parseSdaTable(raw.mukeyResponse);
  if (!mk.ok) return { ok: false, kind: "error", message: mk.message };
  if (mk.table.rows.length === 0) return { ok: false, kind: "no-coverage", message: SDA_NO_COVERAGE_MESSAGE };
  const mukey = mk.table.rows[0]["mukey"];
  if (!mukey || !/^\d+$/.test(mukey)) return { ok: false, kind: "error", message: "The soil service returned a map unit lookup without a usable key." };
  const cp = parseSdaTable(raw.componentResponse);
  if (!cp.ok) return { ok: false, kind: "error", message: cp.message };
  if (cp.table.rows.length === 0) return { ok: false, kind: "error", message: `Map unit ${mukey} came back with no components of 15 percent or more.` };
  const need = ["mukey", "muname", "cokey", "compname", "comppct_r"];
  for (const c of need) if (!cp.table.columns.includes(c)) return { ok: false, kind: "error", message: `The soil service reply is missing the column ${c}.` };
  const muName = cp.table.rows[0]["muname"] ?? "";
  const byKey = new Map<string, SoilComponent>();
  for (const r of cp.table.rows) {
    const cokey = r["cokey"];
    if (!cokey) continue;
    let comp = byKey.get(cokey);
    if (!comp) {
      comp = {
        cokey,
        name: r["compname"] ?? "unnamed component",
        pct: num(r["comppct_r"]) ?? 0,
        slopePct: num(r["slope_r"]),
        drainageClass: r["drainagecl"],
        hydgrp: r["hydgrp"],
        taxClass: r["taxclname"],
        horizons: [],
      };
      byKey.set(cokey, comp);
    }
    const top = num(r["hzdept_r"]);
    const bottom = num(r["hzdepb_r"]);
    if (top === null || bottom === null) continue; // component without horizons (LEFT JOIN null row)
    const h: SoilHorizon = {
      name: r["hzname"],
      topCm: top,
      bottomCm: bottom,
      sandPct: num(r["sandtotal_r"]),
      siltPct: num(r["silttotal_r"]),
      clayPct: num(r["claytotal_r"]),
      omPct: num(r["om_r"]),
      awc: num(r["awc_r"]),
      kf: num(r["kffact"]),
      ksatUmPerS: num(r["ksat_r"]),
      ph: num(r["ph1to1h2o_r"]),
    };
    comp.horizons.push(h);
  }
  const components = [...byKey.values()].sort((a, b) => b.pct - a.pct);
  for (const c of components) c.horizons.sort((a, b) => a.topCm - b.topCm);
  return { ok: true, mukey, muName, components };
}

export type SdaOptions = { fetchImpl?: SdaFetchLike; now?: () => Date; timeoutMs?: number };

async function postQuery(f: SdaFetchLike, query: string, timeoutMs: number): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await f(SDA_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "field-rewind" },
      body: JSON.stringify({ query, format: "JSON+COLUMNNAME" }),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new SdaError(`The soil service (USDA Soil Data Access) answered HTTP ${res.status}: ${text.slice(0, 200)}`);
    const trimmed = text.trim();
    if (trimmed === "") return {}; // SDA answers an empty body when the query matches nothing
    try {
      return JSON.parse(trimmed);
    } catch {
      const m = /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/.exec(trimmed);
      throw new SdaError(`The soil service (USDA Soil Data Access) reported an error: ${(m ? m[1] : trimmed).replace(/\s+/g, " ").slice(0, 200)}`);
    }
  } catch (e) {
    if (e instanceof SdaError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new SdaError(`The soil service (USDA Soil Data Access) did not answer within ${timeoutMs / 1000} seconds.`);
    throw new SdaError(`The soil service (USDA Soil Data Access) could not be reached (${e instanceof Error ? e.message : String(e)}).`);
  } finally {
    clearTimeout(timer);
  }
}

/** One retry on network failure or HTTP 5xx; a timeout is not retried (fail fast). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SdaError && /could not be reached|HTTP 5\d\d/.test(e.message)) return await fn();
    throw e;
  }
}

export async function fetchSdaRaw(lat: number, lon: number, opts: SdaOptions = {}): Promise<SdaRaw> {
  const f = opts.fetchImpl ?? (globalThis.fetch as unknown as SdaFetchLike);
  const timeoutMs = opts.timeoutMs ?? SDA_TIMEOUT_MS;
  const q1 = mukeyQuery(lat, lon);
  const mukeyResponse = await withRetry(() => postQuery(f, q1, timeoutMs));
  const mk = parseSdaTable(mukeyResponse);
  const base = { pinLat: lat, pinLon: lon, endpoint: SDA_ENDPOINT, mukeyQuery: q1 };
  const now = () => (opts.now ?? (() => new Date()))().toISOString();
  if (!mk.ok || mk.table.rows.length === 0 || !mk.table.rows[0]["mukey"]) {
    return { ...base, fetchedAt: now(), mukeyResponse, componentQuery: null, componentResponse: null };
  }
  const q2 = componentQuery(mk.table.rows[0]["mukey"]);
  const componentResponse = await withRetry(() => postQuery(f, q2, timeoutMs));
  return { ...base, fetchedAt: now(), mukeyResponse, componentQuery: q2, componentResponse };
}
