import proj4 from "proj4";
import { GRID_RADIUS_PX, PIXEL_SIZE_M } from "./constants";
import { readWithTimeout, type RasterReader, type WindowRead } from "./cog";
import { NdviHttpError, withRetries, type HttpOptions } from "./http";
import { ndviFromDn, round3, satelliteName } from "./math";
import type { StacItem } from "./stac";
import type { NdviGrid } from "./types";
import type { TokenManager } from "./token";

export type SceneRead = {
  date: string;
  satellite: string;
  sceneId: string;
  /** NDVI of the pixel containing the pin; null = masked (cloud, shadow, snow, fill, out of range). */
  centerNdvi: number | null;
  /** Present when radius > 0. */
  grid?: NdviGrid;
};

/** UTM definition for an EPSG 326xx (north) or 327xx (south) code, else null. */
export function utmDefinition(epsg: number): string | null {
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  return null;
}

export type SceneReadDeps = HttpOptions & { reader: RasterReader; tokens: TokenManager; timeoutMs?: number };

/**
 * Read red, NIR and QA for one scene around the pin and compute NDVI per pixel.
 * radius 0 = the single pixel containing the pin; radius 10 = 21 x 21 window.
 * A 403 from the blob store invalidates the token and retries once with a fresh one.
 */
export async function readScene(item: StacItem, lat: number, lon: number, radius: number, deps: SceneReadDeps): Promise<SceneRead> {
  const epsg = Number(item.properties["proj:epsg"]);
  const def = utmDefinition(epsg);
  if (!def) throw new NdviHttpError("parse", `Scene ${item.id} uses CRS EPSG:${epsg}, which this reader does not support (UTM only).`);
  const [x, y] = proj4("EPSG:4326", def, [lon, lat]);

  const hrefs = { red: item.assets.red?.href, nir: item.assets.nir08?.href, qa: item.assets.qa_pixel?.href };
  if (!hrefs.red || !hrefs.nir || !hrefs.qa) throw new NdviHttpError("parse", `Scene ${item.id} is missing the red, nir08 or qa_pixel asset.`);

  const readAll = async (token: string) =>
    Promise.all([hrefs.red, hrefs.nir, hrefs.qa].map((h) => readWithTimeout(deps.reader, `${h}?${token}`, x, y, radius, deps.timeoutMs)));

  const attempt = async () => {
    try {
      return await readAll(await deps.tokens.get());
    } catch (e) {
      if (e instanceof NdviHttpError && e.status === 403) {
        deps.tokens.invalidate();
        return await readAll(await deps.tokens.get());
      }
      throw e;
    }
  };
  const [red, nir, qa] = await withRetries(attempt, deps);
  for (const r of [nir, qa]) {
    if (r.x0 !== red.x0 || r.y0 !== red.y0 || r.width !== red.width || r.height !== red.height) throw new NdviHttpError("parse", `Scene ${item.id}: bands are not on the same pixel grid.`);
  }

  const date = String(item.properties.datetime ?? "").slice(0, 10);
  const base = { date, satellite: satelliteName(item.properties.platform), sceneId: item.id };
  const pinCol = Math.floor((x - red.originX) / red.resX) - red.x0;
  const pinRow = Math.floor((y - red.originY) / red.resY) - red.y0;
  const at = (c: number, r: number) => ndviFromDn(red.data[r * red.width + c], nir.data[r * red.width + c], qa.data[r * red.width + c]);
  const centerNdvi = pinCol >= 0 && pinRow >= 0 && pinCol < red.width && pinRow < red.height ? at(pinCol, pinRow) : null;
  if (radius === 0) return { ...base, centerNdvi };

  return { ...base, centerNdvi, grid: buildGrid(base, red, def, epsg, radius, x, y, at, pixelSizeOf(red)) };
}

const pixelSizeOf = (w: WindowRead) => Math.abs(w.resX) || PIXEL_SIZE_M;

function buildGrid(
  base: { date: string; satellite: string; sceneId: string },
  w: WindowRead,
  def: string,
  epsg: number,
  radius: number,
  x: number,
  y: number,
  at: (c: number, r: number) => number | null,
  px: number,
): NdviGrid {
  const size = 2 * radius + 1;
  // Place the (possibly clipped) read into the full size x size window; outside the scene stays null.
  const col0 = Math.floor((x - w.originX) / w.resX) - radius;
  const row0 = Math.floor((y - w.originY) / w.resY) - radius;
  const ndvi: (number | null)[][] = Array.from({ length: size }, () => Array<number | null>(size).fill(null));
  let valid = 0;
  for (let r = 0; r < w.height; r++) {
    for (let c = 0; c < w.width; c++) {
      const v = at(c, r);
      if (v === null) continue;
      const gr = w.y0 + r - row0;
      const gc = w.x0 + c - col0;
      if (gr >= 0 && gr < size && gc >= 0 && gc < size) {
        ndvi[gr][gc] = round3(v);
        valid++;
      }
    }
  }
  const xMin = w.originX + col0 * w.resX;
  const xMax = xMin + size * w.resX;
  const yMax = w.originY + row0 * w.resY; // resY is negative: y decreases with row
  const yMin = yMax + size * w.resY;
  const corners = [
    [xMin, yMin],
    [xMax, yMin],
    [xMin, yMax],
    [xMax, yMax],
  ].map(([cx, cy]) => proj4(def, "EPSG:4326", [cx, cy]));
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  return {
    ...base,
    ndvi,
    rows: size,
    cols: size,
    bounds: { west: Math.min(...lons), south: Math.min(...lats), east: Math.max(...lons), north: Math.max(...lats) },
    crsBounds: { xMin: Math.min(xMin, xMax), yMin: Math.min(yMin, yMax), xMax: Math.max(xMin, xMax), yMax: Math.max(yMin, yMax) },
    crs: `EPSG:${epsg}`,
    pixelSizeM: px,
    validFraction: round3(valid / (size * size)),
  };
}

export { GRID_RADIUS_PX };
