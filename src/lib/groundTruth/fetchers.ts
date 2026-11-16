import type { DailyRecord } from "../types";
import { blockPoints, CDL_FIRST_YEAR, CDL_LAST_YEAR, majorityVote, parseCdlValue, toAlbers } from "./cdl";
import { alignDaily, compareDaymetPower, DAYMET_END, DAYMET_START, parseDaymetCsv } from "./daymet";
import { compareToGauge, daymetPrecipMap, daysInclusive, parseReports, parseStations, powerPrecipMap } from "./gauge";
import { HttpError, getText, mapLimit, type HttpOptions } from "./http";
import { CDL_SOURCE, COCORAHS_SOURCE, DAYMET_SOURCE, NLCD_SOURCE, NWIS_SOURCE } from "./label";
import { NLCD_YEAR, parseNlcdFeatureInfo } from "./nlcd";
import type { CdlHistory, CdlPixel, DaymetComparison, DaymetDay, GaugeComparison, GaugeReport, Layer, NlcdClass, SourceInfo, WellsFact } from "./types";
import { nearestWellWithReadings, parseReadings, parseSites } from "./wells";

export type PowerForGround = { status: string; message?: string; days: DailyRecord[]; origin: "live" | "cache" | "saved"; fetchedAt: string };

export const GAUGE_WINDOW = { start: "2018-01-01", end: "2024-12-31" };
/** A gauge qualifies only if it returned at least this many reports in the window. */
export const MIN_GAUGE_REPORTS = 300;
export const MAX_GAUGE_DISTANCE_KM = 15;
export const MAX_GAUGE_CANDIDATES = 5;
export const WELL_RECENT_SINCE = "2015-01-01";
export const WELL_BOX_DEG = 0.2;
export const WELLS_TO_TRY = 12;

/** CoCoRaHS state/county codes for the places we have configured. Other points are "not-checked": there is no county lookup. */
export const GAUGE_COUNTIES: Record<string, { state: string; county: string }> = {
  brentwood: { state: "CA", county: "CC" },
  fresno: { state: "CA", county: "FR" },
};

const now = () => new Date().toISOString();

function layer<T>(source: SourceInfo, status: Layer<T>["status"], message: string, data: NoInfer<T> | null, requestUrls: string[], fetchedAt = now()): Layer<T> {
  return { status, message, data, source, fetchedAt, requestUrls };
}

function errText(e: unknown): string {
  if (e instanceof HttpError) return e.status === null ? e.message : `${e.message}${e.body ? ` (${e.body.replace(/\s+/g, " ").slice(0, 160)})` : ""}`;
  return (e as Error)?.message ?? String(e);
}

// ---------------- Daymet ----------------

export function daymetUrl(lat: number, lon: number): string {
  return `https://daymet.ornl.gov/single-pixel/api/data?lat=${lat}&lon=${lon}&vars=prcp,tmax,tmin&start=${DAYMET_START}&end=${DAYMET_END}&format=csv`;
}

export type DaymetFetch = { layer: Layer<DaymetComparison>; days: DaymetDay[]; csv: string | null };

export async function fetchDaymetLayer(lat: number, lon: number, power: PowerForGround | null, powerNote: string | null, http: HttpOptions): Promise<DaymetFetch> {
  const url = daymetUrl(lat, lon);
  let csv: string;
  try {
    csv = await getText(url, http);
  } catch (e) {
    if (e instanceof HttpError && e.status === 400 && /tile was not found/i.test(e.body)) {
      return {
        days: [],
        csv: null,
        layer: layer(DAYMET_SOURCE, "no-coverage", "Daymet covers North America only, and this point is outside it. The Daymet service replied that no tile exists for these coordinates, so there is no ground-station comparison here.", null, [url]),
      };
    }
    return { days: [], csv: null, layer: layer(DAYMET_SOURCE, "error", `Daymet request failed: ${errText(e)}.`, null, [url]) };
  }
  let parsed;
  try {
    parsed = parseDaymetCsv(csv);
  } catch (e) {
    return { days: [], csv, layer: layer(DAYMET_SOURCE, "error", `Daymet response could not be read: ${errText(e)}`, null, [url]) };
  }
  if (!power || power.status === "error" || !power.days.length) {
    return { days: parsed.days, csv, layer: layer(DAYMET_SOURCE, "error", `NASA POWER data is not available, so there is nothing to compare Daymet with. ${powerNote ?? ""}`.trim(), null, [url]) };
  }
  const cmp = compareDaymetPower(alignDaily(parsed.days, power.days), {
    daymetCell: { lat: parsed.lat, lon: parsed.lon, elevationM: parsed.elevationM },
    power: { origin: power.origin, fetchedAt: power.fetchedAt },
  });
  if (!cmp) return { days: parsed.days, csv, layer: layer(DAYMET_SOURCE, "error", "Daymet and NASA POWER share no days with values in 1985-2024.", null, [url]) };
  return { days: parsed.days, csv, layer: layer(DAYMET_SOURCE, "ok", "Two gridded products compared on the same dates.", cmp, [url]) };
}

// ---------------- CoCoRaHS ----------------

export function cocoStationsUrl(state: string, county: string): string {
  return `https://data.cocorahs.org/cocorahs/export/exportstations.aspx?State=${state}&County=${county}&Format=XML`;
}

export function cocoReportsUrl(stationId: string, w = GAUGE_WINDOW): string {
  const f = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}`;
  return `https://data.cocorahs.org/cocorahs/export/exportreports.aspx?ReportType=Daily&Format=XML&Station=${stationId}&ReportDateType=reportdate&StartDate=${f(w.start)}&EndDate=${f(w.end)}&TimesInGMT=False`;
}

export type GaugeFetch = { layer: Layer<GaugeComparison>; reports: GaugeReport[] };

export async function fetchGaugeLayer(
  lat: number,
  lon: number,
  pinId: string | null,
  power: PowerForGround | null,
  daymetDays: DaymetDay[],
  http: HttpOptions,
): Promise<GaugeFetch> {
  const cfg = pinId ? GAUGE_COUNTIES[pinId] : undefined;
  if (pinId === "ludhiana") {
    return { reports: [], layer: layer(COCORAHS_SOURCE, "no-coverage", "CoCoRaHS is a network of volunteer rain gauges in the United States, Canada and a few other places. No station is configured for this place.", null, []) };
  }
  if (!cfg) {
    return { reports: [], layer: layer(COCORAHS_SOURCE, "not-checked", "The gauge check needs a CoCoRaHS state and county, and automatic county lookup is not built. It runs only for the saved example places.", null, []) };
  }
  const stUrl = cocoStationsUrl(cfg.state, cfg.county);
  const urls = [stUrl];
  try {
    const stations = parseStations(await getText(stUrl, http), lat, lon).filter((s) => s.distanceKm <= MAX_GAUGE_DISTANCE_KM).slice(0, MAX_GAUGE_CANDIDATES);
    if (!stations.length) return { reports: [], layer: layer(COCORAHS_SOURCE, "no-coverage", `No CoCoRaHS station within ${MAX_GAUGE_DISTANCE_KM} km of this point in ${cfg.state}-${cfg.county}.`, null, urls) };
    let chosen: { station: (typeof stations)[number]; reports: GaugeReport[]; returned: number } | null = null;
    const skipped: string[] = [];
    for (const s of stations) {
      const u = cocoReportsUrl(s.id);
      urls.push(u);
      const reports = parseReports(await getText(u, http));
      if (reports.length >= MIN_GAUGE_REPORTS) {
        chosen = { station: s, reports, returned: reports.length };
        break;
      }
      skipped.push(`${s.name} (${s.distanceKm.toFixed(1)} km, ${reports.length} reports)`);
    }
    if (!chosen) return { reports: [], layer: layer(COCORAHS_SOURCE, "no-coverage", `No nearby CoCoRaHS gauge reported at least ${MIN_GAUGE_REPORTS} times in ${GAUGE_WINDOW.start} to ${GAUGE_WINDOW.end}. Checked: ${skipped.join("; ")}.`, null, urls) };
    if (!power || power.status === "error") return { reports: chosen.reports, layer: layer(COCORAHS_SOURCE, "error", "NASA POWER data is not available, so the gauge cannot be compared with it.", null, urls) };
    const pw = compareToGauge(chosen.reports, powerPrecipMap(power.days));
    const dm = compareToGauge(chosen.reports, daymetPrecipMap(daymetDays));
    if (!pw || !dm) {
      return { reports: chosen.reports, layer: layer(COCORAHS_SOURCE, "error", "The gauge shares no reporting days with one of the two products (is Daymet available?).", null, urls) };
    }
    const readable = chosen.reports.filter((r) => r.precipMm !== null);
    const skippedNote = skipped.length ? ` Nearer stations skipped for too few reports: ${skipped.join("; ")}.` : "";
    const data: GaugeComparison = {
      station: chosen.station,
      selection: `Nearest CoCoRaHS station within ${MAX_GAUGE_DISTANCE_KM} km of the point that returned at least ${MIN_GAUGE_REPORTS} daily reports in ${GAUGE_WINDOW.start} to ${GAUGE_WINDOW.end}, chosen by straight-line distance from the station list for ${cfg.state}-${cfg.county}.${skippedNote}`,
      window: GAUGE_WINDOW,
      reportsReturned: chosen.reports.length,
      reportedDays: readable.length,
      daysWithoutReport: daysInclusive(GAUGE_WINDOW.start, GAUGE_WINDOW.end) - chosen.reports.length,
      gaugeRainyDays: readable.filter((r) => (r.precipMm as number) >= 1).length,
      power: pw,
      daymet: dm,
    };
    return { reports: chosen.reports, layer: layer(COCORAHS_SOURCE, "ok", "Single-gauge comparison on days the gauge reported only.", data, urls) };
  } catch (e) {
    return { reports: [], layer: layer(COCORAHS_SOURCE, "error", `CoCoRaHS request failed: ${errText(e)}.`, null, urls) };
  }
}

// ---------------- CDL ----------------

export function cdlUrl(year: number, x: number, y: number): string {
  return `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${year}&x=${x}&y=${y}`;
}

/** Rough bounding box of the continental US, used only to explain a failed request, never to skip one. */
function insideConus(lat: number, lon: number): boolean {
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
}

export async function fetchCdlLayer(lat: number, lon: number, http: HttpOptions, concurrency = 6): Promise<Layer<CdlHistory>> {
  const { x, y } = toAlbers(lat, lon);
  const probeUrl = cdlUrl(2022, x, y);
  // One cheap request first: tells "outside coverage" from "service down" before 150 more requests.
  try {
    const t = await getText(probeUrl, { ...http, maxRetries: 1, timeoutMs: 20_000 });
    if (!parseCdlValue(t)) return layer(CDL_SOURCE, "no-coverage", "The Cropland Data Layer returned no value for this point (it covers the continental United States only).", null, [probeUrl]);
  } catch (e) {
    if (e instanceof HttpError && e.status === 500 && /failed to get value/i.test(e.body)) {
      return layer(CDL_SOURCE, "no-coverage", "The Cropland Data Layer service answered 'Failed to get value' for this point. It covers the continental United States only, so there is no satellite crop history here.", null, [probeUrl]);
    }
    if (!insideConus(lat, lon)) {
      return layer(CDL_SOURCE, "no-coverage", `The Cropland Data Layer covers the continental United States only (roughly latitude 24 to 50, longitude -125 to -66), and this point is outside that box. The real request for this point did not return a value (${errText(e)}).`, null, [probeUrl]);
    }
    return layer(CDL_SOURCE, "error", `Cropland Data Layer request failed: ${errText(e)}.`, null, [probeUrl]);
  }
  const years: number[] = [];
  for (let yr = CDL_FIRST_YEAR; yr <= CDL_LAST_YEAR; yr++) years.push(yr);
  const pts = blockPoints(x, y);
  const jobs = years.flatMap((yr) => pts.map((p) => ({ yr, p })));
  const results = await mapLimit(jobs, concurrency, async ({ yr, p }) => {
    try {
      return parseCdlValue(await getText(cdlUrl(yr, p.x, p.y), { ...http, timeoutMs: 30_000 }));
    } catch {
      return null;
    }
  });
  // One more try, one at a time, for any pixel that failed (a failure is never turned into a value).
  for (let i = 0; i < jobs.length; i++) {
    if (results[i]) continue;
    const j = jobs[i]!;
    try {
      const r = parseCdlValue(await getText(cdlUrl(j.yr, j.p.x, j.p.y), { ...http, timeoutMs: 30_000 }));
      if (r) {
        results[i] = r;
      }
    } catch {
      /* stays failed */
    }
  }
  const failed = results.filter((r) => !r).length;
  const out = years.map((yr) => {
    const px: CdlPixel[] = [];
    let centre: CdlPixel | null = null;
    jobs.forEach((j, i) => {
      if (j.yr !== yr) return;
      const r = results[i];
      if (!r) return;
      px.push(r);
      if (j.p.centre) centre = r;
    });
    return majorityVote(yr, px, centre);
  });
  const answered = out.filter((o) => o.majority).length;
  if (!answered) return layer(CDL_SOURCE, "error", "Cropland Data Layer returned no readable values for any year.", null, [probeUrl]);
  const data: CdlHistory = { years: out, pixelsPerYear: pts.length, failedRequests: failed };
  return layer(CDL_SOURCE, "ok", failed ? `${failed} of ${jobs.length} pixel requests failed and are left out.` : "All pixel requests answered.", data, [probeUrl]);
}

// ---------------- NLCD ----------------

export function nlcdUrl(lat: number, lon: number, d = 0.0003): string {
  return `https://www.mrlc.gov/geoserver/mrlc_display/NLCD_${NLCD_YEAR}_Land_Cover_L48/wms?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=NLCD_${NLCD_YEAR}_Land_Cover_L48&query_layers=NLCD_${NLCD_YEAR}_Land_Cover_L48&info_format=application/json&srs=EPSG:4326&bbox=${lon - d},${lat - d},${lon + d},${lat + d}&width=3&height=3&x=1&y=1`;
}

export async function fetchNlcdLayer(lat: number, lon: number, http: HttpOptions): Promise<Layer<NlcdClass>> {
  const url = nlcdUrl(lat, lon);
  try {
    const r = parseNlcdFeatureInfo(await getText(url, http));
    if (r.kind === "class") return layer(NLCD_SOURCE, "ok", `NLCD ${NLCD_YEAR} class for the 30 m pixel at this point.`, r.value, [url]);
    if (r.kind === "empty") return layer(NLCD_SOURCE, "no-coverage", `NLCD ${NLCD_YEAR} (continental US) returned no pixel for this point, which is outside its coverage.`, null, [url]);
    return layer(NLCD_SOURCE, "error", `NLCD returned class code ${r.code}, which is not in the official legend, so it is not shown.`, null, [url]);
  } catch (e) {
    return layer(NLCD_SOURCE, "error", `NLCD request failed: ${errText(e)}.`, null, [url]);
  }
}

// ---------------- NWIS wells ----------------

const NWIS = "https://api.waterdata.usgs.gov/ogcapi/v0/collections/";

export async function fetchWellsLayer(lat: number, lon: number, http: HttpOptions): Promise<Layer<WellsFact>> {
  const dLon = WELL_BOX_DEG / Math.cos((lat * Math.PI) / 180);
  const bbox = `${(lon - dLon).toFixed(4)},${(lat - WELL_BOX_DEG).toFixed(4)},${(lon + dLon).toFixed(4)},${(lat + WELL_BOX_DEG).toFixed(4)}`;
  const siteUrl = `${NWIS}monitoring-locations/items?f=json&bbox=${bbox}&site_type_code=GW&limit=500`;
  const recentUrl = `${NWIS}field-measurements/items?f=json&bbox=${bbox}&parameter_code=72019&time=${WELL_RECENT_SINCE}T00:00:00Z/..&limit=1000`;
  const urls = [siteUrl, recentUrl];
  const radiusKm = Math.round(WELL_BOX_DEG * 111);
  try {
    const sites = parseSites(await getText(siteUrl, http), lat, lon);
    if (!sites.length) return layer(NWIS_SOURCE, "no-coverage", `USGS NWIS lists no groundwater wells within about ${radiusKm} km of this point (NWIS covers the United States and its territories).`, null, urls);
    const recentRows = parseReadings(await getText(recentUrl, http));
    const nearestRecent = nearestWellWithReadings(recentRows, sites, lat, lon, WELL_RECENT_SINCE);
    const tryUrls = sites.slice(0, WELLS_TO_TRY).map((s) => `${NWIS}field-measurements/items?f=json&monitoring_location_id=${s.id}&parameter_code=72019&limit=20&sortby=-time`);
    const perSite = await mapLimit(tryUrls, 4, async (u) => {
      try {
        return parseReadings(await getText(u, http));
      } catch {
        return null;
      }
    });
    let nearest = null as WellsFact["nearest"];
    for (let i = 0; i < perSite.length; i++) {
      const rows = perSite[i];
      if (!rows || !rows.length) continue;
      const s = sites[i]!;
      nearest = {
        id: s.id,
        name: s.name,
        distanceKm: s.distanceKm,
        readings: rows.slice(0, 5).map(({ date, value, unit, qualifier, approval }) => ({ date, value, unit, qualifier, approval })),
        readingsReturned: rows.length,
      };
      break;
    }
    urls.push(...tryUrls.slice(0, 2));
    const data: WellsFact = {
      parameterCode: "72019",
      nearest,
      nearestRecent: nearestRecent && nearest && nearestRecent.id === nearest.id ? null : nearestRecent,
      recentSince: WELL_RECENT_SINCE,
      searchRadiusKm: radiusKm,
      sitesSearched: sites.length,
    };
    if (!nearest && !nearestRecent) return layer(NWIS_SOURCE, "no-coverage", `${sites.length} USGS wells lie within about ${radiusKm} km, but none of the ${Math.min(WELLS_TO_TRY, sites.length)} nearest has depth-to-water readings, and none anywhere in the box has one since ${WELL_RECENT_SINCE}.`, null, urls);
    return layer(NWIS_SOURCE, "ok", "Nearest-well readings (not a statement about this field's water table).", data, urls);
  } catch (e) {
    return layer(NWIS_SOURCE, "error", `USGS NWIS request failed: ${errText(e)}.`, null, urls);
  }
}
