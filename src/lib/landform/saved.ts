/** Reads the committed saved responses in data/landform. No network. Server-side only (node:fs). */
import fs from "node:fs";
import path from "node:path";
import { assemble, buildSoil, buildTerrain } from "./assemble";
import { deriveTerrain } from "./terrain";
import type { LandformGridFile, LandformResult, LandformSavedFile, TerrainGrid, TerrainRaw } from "./types";

export const DATA_DIR = () => path.join(process.cwd(), "data", "landform");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function readSavedFile(id: string, dir = DATA_DIR()): LandformSavedFile {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Unknown saved place "${id}".`);
  return readJson<LandformSavedFile>(path.join(dir, `${id}.json`));
}

export function readSavedGridFile(id: string, dir = DATA_DIR()): LandformGridFile {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Unknown saved place "${id}".`);
  return readJson<LandformGridFile>(path.join(dir, `${id}-grid.json`));
}

function errorResult(lat: number, lon: number, message: string): LandformResult {
  return {
    status: "error", lat, lon, origin: "saved", fetchedAt: null, message,
    terrain: { status: "error", message }, soil: { status: "error", message }, erosion: null,
  };
}

/** Saved result for a demo pin or the sample point. The grid is left out (use loadSavedLandformGrid) unless includeGrid. */
export function loadSavedLandformSync(id: string, opts: { includeGrid?: boolean; dir?: string } = {}): LandformResult {
  try {
    const dir = opts.dir ?? DATA_DIR();
    const file = readSavedFile(id, dir);
    const gridFile = readSavedGridFile(id, dir);
    const terrain = buildTerrain(gridFile.terrain, "saved", Boolean(opts.includeGrid));
    const soil = buildSoil(file.sda, "saved");
    return assemble({ lat: file.lat, lon: file.lon, origin: "saved", terrain, soil, landUse: file.landUse });
  } catch (e) {
    return errorResult(NaN, NaN, `No saved landform response for "${id}" could be read (${e instanceof Error ? e.message : String(e)}).`);
  }
}

export function loadSavedGridSync(id: string, dir = DATA_DIR()): { grid: TerrainGrid; raw: TerrainRaw } | { error: string } {
  try {
    const raw = readSavedGridFile(id, dir).terrain;
    const d = deriveTerrain(raw);
    return d.ok ? { grid: d.grid, raw } : { error: d.message };
  } catch (e) {
    return { error: `No saved terrain grid for "${id}" could be read (${e instanceof Error ? e.message : String(e)}).` };
  }
}
