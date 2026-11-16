/** Builds results from raw responses. The same code runs for live, cached and saved data. */
import { erosionIndicator } from "./erosion";
import { parseSoil } from "./sda";
import { deriveSoil } from "./soil";
import { deriveTerrain } from "./terrain";
import type { LandUseCheck, LandformOrigin, LandformResult, SdaRaw, SoilResult, TerrainRaw, TerrainResult } from "./types";

export function buildTerrain(raw: TerrainRaw, origin: LandformOrigin, includeGrid: boolean): TerrainResult {
  const d = deriveTerrain(raw);
  if (!d.ok) return { status: "error", message: d.message };
  return { status: "ok", origin, fetchedAt: raw.fetchedAt, tileId: raw.tileId, assetUrl: raw.assetUrl, summary: d.summary, ...(includeGrid ? { grid: d.grid } : {}) };
}

export function buildSoil(raw: SdaRaw, origin: LandformOrigin): SoilResult {
  const p = parseSoil(raw);
  if (!p.ok) return p.kind === "no-coverage" ? { status: "no-coverage", origin, fetchedAt: raw.fetchedAt, message: p.message } : { status: "error", message: p.message };
  const derived = deriveSoil(p.components);
  if (!derived) return { status: "error", message: "The soil service returned no usable components." };
  return { status: "ok", origin, fetchedAt: raw.fetchedAt, mukey: p.mukey, muName: p.muName, components: p.components, derived };
}

export type Parts = {
  lat: number;
  lon: number;
  origin: LandformOrigin;
  terrain: TerrainResult;
  soil: SoilResult;
  landUse?: LandUseCheck;
};

export function assemble(p: Parts): LandformResult {
  const times: string[] = [];
  if (p.terrain.status === "ok") times.push(p.terrain.fetchedAt);
  if (p.soil.status === "ok" || p.soil.status === "no-coverage") times.push(p.soil.fetchedAt);
  const fetchedAt = times.length ? times.sort()[0] : null;
  const erosion =
    p.terrain.status === "ok" && p.soil.status === "ok"
      ? erosionIndicator(p.terrain.summary.centerSlopePct, p.soil.derived.kfTop)
      : p.terrain.status === "ok"
        ? erosionIndicator(p.terrain.summary.centerSlopePct, null)
        : null;
  const terrainOk = p.terrain.status === "ok";
  const soilFailed = p.soil.status === "error";
  const status: LandformResult["status"] = terrainOk ? (soilFailed ? "partial" : "ok") : p.soil.status === "ok" ? "partial" : "error";
  const msgs: string[] = [];
  if (p.terrain.status === "error") msgs.push(`Terrain: ${p.terrain.message}`);
  if (p.soil.status === "error") msgs.push(`Soil: ${p.soil.message}`);
  return { status, lat: p.lat, lon: p.lon, origin: p.origin, fetchedAt, ...(msgs.length ? { message: msgs.join(" ") } : {}), terrain: p.terrain, soil: p.soil, erosion, ...(p.landUse ? { landUse: p.landUse } : {}) };
}
