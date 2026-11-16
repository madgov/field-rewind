import fs from "node:fs/promises";
import path from "node:path";
import { DEMO_PINS } from "../demoPins";
import { offlineFromEnv } from "../power/offline";
import type { PowerResult } from "../types";
import { fetchCdlLayer, fetchDaymetLayer, fetchGaugeLayer, fetchNlcdLayer, fetchWellsLayer, type DaymetFetch, type PowerForGround } from "./fetchers";
import type { HttpOptions } from "./http";
import type { GroundTruthOk, GroundTruthResult, SavedGroundTruth } from "./types";

export const GROUND_OFFLINE_MESSAGE =
  "Offline mode is on (FIELD_REWIND_OFFLINE), so this server is not allowed to contact Daymet, USDA, CoCoRaHS, MRLC or USGS. Only the saved example places (Brentwood, Fresno, Ludhiana) have a ground check.";

const PIN_TOLERANCE_DEG = 0.005;

export function matchDemoPin(lat: number, lon: number): string | null {
  const p = DEMO_PINS.find((d) => Math.abs(d.lat - lat) <= PIN_TOLERANCE_DEG && Math.abs(d.lon - lon) <= PIN_TOLERANCE_DEG);
  return p ? p.id : null;
}

export type GroundTruthDeps = {
  http?: HttpOptions;
  offline?: boolean;
  /** Directory holding <pinId>.json. Default: <cwd>/data/ground-truth */
  savedDir?: string;
  /** Source of POWER daily data for the live path. Default: getPowerData from ../power (loaded lazily). */
  getPower?: (lat: number, lon: number) => Promise<PowerResult>;
};

function errorResult(lat: number, lon: number, message: string): GroundTruthResult {
  return { status: "error", lat, lon, message };
}

export function createGroundTruthService(deps: GroundTruthDeps = {}) {
  const http = deps.http ?? {};
  const dir = () => deps.savedDir ?? path.join(process.cwd(), "data", "ground-truth");
  const offline = () => deps.offline ?? offlineFromEnv();

  async function loadSavedGroundTruth(pinId: string): Promise<GroundTruthResult> {
    const pin = DEMO_PINS.find((p) => p.id === pinId);
    if (!pin) return errorResult(NaN, NaN, `"${pinId}" is not a saved example place.`);
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir(), `${pinId}.json`), "utf8")) as SavedGroundTruth;
      if (raw.schema !== 1 || raw.status !== "ok") throw new Error("unexpected file shape");
      return { ...raw, origin: "saved" };
    } catch (e) {
      return errorResult(pin.lat, pin.lon, `The saved ground check for ${pin.name} could not be read (${(e as Error).message}). Run: npx tsx scripts/fetch-ground-truth.ts`);
    }
  }

  async function powerFor(lat: number, lon: number): Promise<{ power: PowerForGround | null; note: string | null }> {
    try {
      const get = deps.getPower ?? (await import("../power")).getPowerData;
      const p = await get(lat, lon);
      return { power: p, note: p.status === "error" ? (p.message ?? null) : null };
    } catch (e) {
      return { power: null, note: (e as Error).message };
    }
  }

  /** Always live. Never writes anything. Documented timings (Brentwood, one run): see docs/ground-truth.md. */
  async function fetchLive(lat: number, lon: number, pinId: string | null): Promise<GroundTruthOk & { _daymetCsv: string | null }> {
    const { power, note } = await powerFor(lat, lon);
    const dm: Promise<DaymetFetch> = fetchDaymetLayer(lat, lon, power, note, http);
    const [daymet, cdl, nlcd, wells] = await Promise.all([dm, fetchCdlLayer(lat, lon, http), fetchNlcdLayer(lat, lon, http), fetchWellsLayer(lat, lon, http)]);
    const gauge = await fetchGaugeLayer(lat, lon, pinId, power, daymet.days, http);
    return {
      status: "ok",
      pinId,
      lat,
      lon,
      origin: "live",
      fetchedAt: daymet.layer.fetchedAt,
      daymet: daymet.layer,
      gauge: gauge.layer,
      cdl,
      nlcd,
      wells,
      _daymetCsv: daymet.csv,
    };
  }

  async function getGroundTruth(lat: number, lon: number, opts: { fresh?: boolean } = {}): Promise<GroundTruthResult> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return errorResult(lat, lon, "Latitude must be -90 to 90 and longitude -180 to 180.");
    const pinId = matchDemoPin(lat, lon);
    if (offline()) {
      if (pinId && !opts.fresh) return loadSavedGroundTruth(pinId);
      return errorResult(lat, lon, GROUND_OFFLINE_MESSAGE);
    }
    if (pinId && !opts.fresh) return loadSavedGroundTruth(pinId);
    const { _daymetCsv, ...live } = await fetchLive(lat, lon, pinId);
    void _daymetCsv;
    return live;
  }

  return { getGroundTruth, loadSavedGroundTruth, fetchLive };
}
