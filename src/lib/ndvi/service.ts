import { DEMO_PINS } from "../demoPins";
import { LIVE_MAX_SCENES, LIVE_YEARS } from "./constants";
import { isNdviOffline, NDVI_OFFLINE_MESSAGE } from "./offline";
import { retrieveSeries, type RetrieveDeps } from "./retrieve";
import { errorSeries, loadSavedNdvi } from "./saved";
import type { NdviSeriesResult } from "./types";

/** A coordinate within this many degrees of a demo pin (about 11 m) is treated as that pin. */
const PIN_TOLERANCE_DEG = 0.0001;

export type NdviServiceDeps = RetrieveDeps & {
  dataDir?: string;
  offline?: boolean | (() => boolean);
  years?: number;
  maxScenes?: number;
};

export function createNdviService(deps: NdviServiceDeps = {}) {
  const cache = new Map<string, NdviSeriesResult>();
  const inflight = new Map<string, Promise<NdviSeriesResult>>();
  const offline = () => (typeof deps.offline === "function" ? deps.offline() : (deps.offline ?? isNdviOffline()));

  /**
   * Saved demo pin, else (online only) a live Landsat read of the last `years` (default 3) years, capped at
   * `maxScenes` (default 40) scenes read three at a time. That takes roughly 0.5-1.5 s per scene, so a full live
   * request typically takes 15-60 s: show a waiting state. Results are kept in memory and then reported as
   * origin "cache" ("saved response from ..."). Offline mode never touches the network.
   */
  async function getNdviSeries(lat: number, lon: number, opts: { fresh?: boolean } = {}): Promise<NdviSeriesResult> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return errorSeries(lat, lon, "Latitude must be between -90 and 90 and longitude between -180 and 180.");
    const pin = DEMO_PINS.find((p) => Math.abs(p.lat - lat) <= PIN_TOLERANCE_DEG && Math.abs(p.lon - lon) <= PIN_TOLERANCE_DEG);
    if (pin && !opts.fresh) {
      const r = await loadSavedNdvi(pin.id, deps.dataDir);
      if (r.status !== "error") return r;
    }
    if (offline()) return { ...errorSeries(lat, lon, NDVI_OFFLINE_MESSAGE), origin: "live" };
    const key = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
    if (!opts.fresh) {
      const hit = cache.get(key);
      if (hit) return { ...hit, origin: "cache" };
    }
    const running = inflight.get(key);
    if (running && !opts.fresh) return running;
    const now = deps.now?.() ?? new Date();
    const end = now.toISOString().slice(0, 10);
    const start = `${now.getUTCFullYear() - (deps.years ?? LIVE_YEARS)}-${end.slice(5)}`;
    const p = retrieveSeries({ lat, lon, start, end, maxScenes: deps.maxScenes ?? LIVE_MAX_SCENES }, deps)
      .then((r) => {
        if (r.status !== "error") cache.set(key, r);
        return r;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  return { getNdviSeries, loadSavedNdvi: (id: string) => loadSavedNdvi(id, deps.dataDir) };
}
