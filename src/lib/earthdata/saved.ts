import fs from "node:fs/promises";
import path from "node:path";
import { DEMO_PINS } from "../demoPins";
import type { EarthdataFile, EarthdataResult } from "./types";
import { monthlyRainMm } from "./normalize";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nullable = (v: unknown) => v === null || number(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const granule = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_.:-]+$/.test(v);
const coords = (o: Record<string, unknown>) => number(o.pixelLat) && Math.abs(o.pixelLat) <= 90 && number(o.pixelLon) && Math.abs(o.pixelLon) <= 180;

function validProducts(value: unknown): boolean {
  if (!record(value) || !record(value.smap) || !record(value.imerg)) return false;
  const s = value.smap, i = value.imerg;
  return s.shortName === "SPL3SMP_E" && s.version === "006" && s.collectionId === "C2938664763-NSIDC_CPRD" && s.units === "m3/m3" && s.grid === "EASE-Grid 2.0 Global EPSG:6933" && s.sampling === "native cell containing pin; no resampling" && i.shortName === "GPM_3IMERGM" && i.version === "07" && i.collectionId === "C2723754851-GES_DISC" && i.rateUnits === "mm/hr" && i.totalUnits === "mm" && i.qualityIndexUnits === "Equivalent gauges per 2.5 deg box" && i.grid === "0.1 degree longitude/latitude";
}

function validLayer(value: unknown, kind: "smap" | "imerg"): boolean {
  if (!record(value) || !["ok", "no-data", "error"].includes(String(value.status)) || !date(value.requestedStart) || !date(value.requestedEnd) || value.requestedEnd < value.requestedStart || !Array.isArray(value.observations) || value.observations.length > 366) return false;
  if (value.status === "error") return value.observations.length === 0 && typeof value.message === "string" && value.message.length > 0;
  if (value.observations.length === 0) return false;
  const seen = new Set<string>(); let usable = 0;
  for (const item of value.observations) {
    if (!record(item) || !coords(item) || !granule(item.sourceGranule)) return false;
    if (kind === "smap") {
      if (!date(item.date) || item.date < value.requestedStart || item.date > value.requestedEnd || seen.has(item.date) || !nullable(item.rawValueM3M3) || !nullable(item.valueM3M3) || !nullable(item.retrievalQualityFlag)) return false;
      seen.add(item.date);
      const qa = item.retrievalQualityFlag;
      if (qa !== null && (!number(qa) || !Number.isInteger(qa) || qa < 0 || qa > 15)) return false;
      if (item.rawValueM3M3 !== null && (!number(item.rawValueM3M3) || item.rawValueM3M3 < 0 || item.rawValueM3M3 > 1)) return false;
      const good = item.rawValueM3M3 !== null && number(qa) && (qa & 7) === 0;
      if (item.valueM3M3 !== (good ? item.rawValueM3M3 : null) || item.quality !== (good ? "recommended" : item.rawValueM3M3 === null || qa === null ? "missing" : "not-recommended")) return false;
      if (good) usable++;
    } else {
      if (typeof item.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.month) || seen.has(item.month) || item.month !== value.requestedStart.slice(0, 7) || item.month !== value.requestedEnd.slice(0, 7)) return false;
      seen.add(item.month);
      for (const key of ["rateMmPerHour", "totalMm", "randomErrorMmPerHour", "qualityIndex"]) if (!nullable(item[key]) || (number(item[key]) && item[key] < 0)) return false;
      const total = monthlyRainMm(item.month, item.rateMmPerHour as number | null);
      if (total === null ? item.totalMm !== null : !number(item.totalMm) || Math.abs(item.totalMm - total) > 1e-7) return false;
      if (item.rateMmPerHour !== null) usable++;
    }
  }
  return value.status === (usable > 0 ? "ok" : "no-data");
}

/** Saved-file only: no token, network or credential-dependent imports. Works with offline mode. */
export async function loadSavedEarthdata(lat: number, lon: number, dataDir = path.join(process.cwd(), "data", "earthdata")): Promise<EarthdataResult> {
  const pin = DEMO_PINS.find(p => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005);
  if (!pin) return { status: "unavailable", message: "SMAP and IMERG snapshots are saved only for the three demo places. No Earthdata request is made while a page loads." };
  let data: EarthdataFile;
  try {
    data = JSON.parse(await fs.readFile(path.join(dataDir, `${pin.id}.json`), "utf8"));
  } catch {
    return { status: "unavailable", message: `Saved Earthdata response data/earthdata/${pin.id}.json is missing or unreadable. Run scripts/fetch-earthdata.ts with a server-side EARTHDATA_TOKEN; no values are substituted.` };
  }
  if (!record(data) || data.schemaVersion !== 1 || data.pinId !== pin.id || data.lat !== pin.lat || data.lon !== pin.lon || typeof data.fetchedAt !== "string" || !Number.isFinite(Date.parse(data.fetchedAt)) || !validProducts(data.products) || !validLayer(data.smap, "smap") || !validLayer(data.imerg, "imerg")) {
    return { status: "unavailable", message: `Saved Earthdata response for ${pin.id} has an unsupported shape or location. Fetch it again; no values are substituted.` };
  }
  return { status: "saved", data, originLine: `Saved response from ${data.fetchedAt.replace("T", " ").replace("Z", " UTC")}` };
}
