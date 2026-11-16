/**
 * Pure terrain maths: Horn slope and aspect, grid derivation, summaries. No I/O.
 *
 * Horn (1981) 3x3 finite differences. For a cell with neighbours
 *     a b c        (a = north-west, c = north-east)
 *     d e f
 *     g h i        (g = south-west, i = south-east)
 * and cell spacing dx (east-west) and dy (north-south), in metres:
 *     dz/dx (positive when ground rises to the east)  = ((c + 2f + i) - (a + 2d + g)) / (8 dx)
 *     dz/dy (positive when ground rises to the north) = ((a + 2b + c) - (g + 2h + i)) / (8 dy)
 *     slope  = atan( sqrt( (dz/dx)^2 + (dz/dy)^2 ) )
 *     aspect = compass direction of steepest DESCENT = atan2( -dz/dx, -dz/dy ), degrees clockwise from north.
 * Reference: B. K. P. Horn, "Hill shading and the reflectance map", Proceedings of the IEEE 69(1), 14-47, 1981,
 * doi:10.1109/PROC.1981.11918.
 */
import type { TerrainGrid, TerrainRaw, TerrainSummary } from "./types";

export const GRID_SIZE = 41;

/** Metres per degree of latitude and longitude on the WGS84 ellipsoid at a latitude (standard series expansion). */
export function metersPerDegree(latDeg: number): { lat: number; lon: number } {
  const p = (latDeg * Math.PI) / 180;
  const lat = 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
  const lon = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
  return { lat, lon };
}

const DEG = 180 / Math.PI;

export function slopePercentFromDegrees(deg: number): number {
  return Math.tan((deg * Math.PI) / 180) * 100;
}

/**
 * Slope (degrees) and aspect (degrees clockwise from north the slope faces, null if flat) of the centre cell of a
 * 3x3 neighbourhood given as [a,b,c,d,e,f,g,h,i] (row-major, first row = north).
 */
export function hornSlopeAspect(n: ArrayLike<number>, dx: number, dy: number): { slopeDeg: number; aspectDeg: number | null } {
  const [a, b, c, d, , f, g, h, i] = [n[0], n[1], n[2], n[3], n[4], n[5], n[6], n[7], n[8]];
  const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * dx);
  const dzdy = (a + 2 * b + c - (g + 2 * h + i)) / (8 * dy);
  const mag = Math.hypot(dzdx, dzdy);
  const slopeDeg = Math.atan(mag) * DEG;
  if (mag < 1e-12) return { slopeDeg: 0, aspectDeg: null };
  let aspect = Math.atan2(-dzdx, -dzdy) * DEG;
  aspect = ((aspect % 360) + 360) % 360;
  if (aspect >= 359.9999999) aspect = 0;
  return { slopeDeg, aspectDeg: aspect };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export type TerrainDeriveResult = { ok: true; grid: TerrainGrid; summary: TerrainSummary } | { ok: false; message: string };

/** Turn a raw elevation window (grid + 1 ring of margin) into the slope/aspect grid and a summary. */
export function deriveTerrain(raw: TerrainRaw): TerrainDeriveResult {
  const { windowRows: wr, windowCols: wc } = raw;
  if (wr < 3 || wc < 3 || raw.elevationM.length !== wr * wc) {
    return { ok: false, message: `Terrain window is malformed (${raw.elevationM.length} values for ${wr} x ${wc}).` };
  }
  const bad = raw.elevationM.findIndex((v) => !Number.isFinite(v) || (raw.noData !== null && v === raw.noData));
  if (bad >= 0) {
    return { ok: false, message: "The elevation tile has missing (no-data) cells around this point, so slope cannot be computed here." };
  }
  const rows = wr - 2;
  const cols = wc - 2;
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  const centerLat = raw.windowNorth - (centerRow + 1.5) * raw.resDegLat;
  const centerLon = raw.windowWest + (centerCol + 1.5) * raw.resDegLon;
  const m = metersPerDegree(centerLat);
  const dy = raw.resDegLat * m.lat;
  const dx = raw.resDegLon * m.lon;

  const elev = new Array<number>(rows * cols);
  const slope = new Array<number>(rows * cols);
  const aspect = new Array<number | null>(rows * cols);
  const nb = new Array<number>(9);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < 9; k++) {
        const rr = r + 1 + Math.floor(k / 3) - 1;
        const cc = c + 1 + (k % 3) - 1;
        nb[k] = raw.elevationM[rr * wc + cc];
      }
      const res = hornSlopeAspect(nb, dx, dy);
      const idx = r * cols + c;
      elev[idx] = nb[4];
      slope[idx] = Math.round(res.slopeDeg * 100) / 100;
      aspect[idx] = res.aspectDeg === null ? null : Math.round(res.aspectDeg);
    }
  }
  const grid: TerrainGrid = {
    rows,
    cols,
    cellArcSec: Math.round(raw.resDegLat * 3600 * 100) / 100,
    bounds: {
      west: raw.windowWest + raw.resDegLon,
      east: raw.windowWest + (cols + 1) * raw.resDegLon,
      north: raw.windowNorth - raw.resDegLat,
      south: raw.windowNorth - (rows + 1) * raw.resDegLat,
    },
    centerLat,
    centerLon,
    cellSizeM: { northSouth: dy, eastWest: dx },
    elevationM: elev,
    slopeDeg: slope,
    aspectDeg: aspect,
  };
  return { ok: true, grid, summary: summarizeGrid(grid) };
}

export function summarizeGrid(grid: TerrainGrid): TerrainSummary {
  const ci = Math.floor(grid.rows / 2) * grid.cols + Math.floor(grid.cols / 2);
  const pcts = grid.slopeDeg.map(slopePercentFromDegrees).sort((x, y) => x - y);
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.elevationM) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    centerElevationM: grid.elevationM[ci],
    centerSlopeDeg: grid.slopeDeg[ci],
    centerSlopePct: round1(slopePercentFromDegrees(grid.slopeDeg[ci])),
    centerAspectDeg: grid.aspectDeg[ci],
    minElevationM: min,
    maxElevationM: max,
    reliefM: max - min,
    medianSlopePct: round1(percentile(pcts, 0.5)),
    p90SlopePct: round1(percentile(pcts, 0.9)),
    extentM: { northSouth: grid.rows * grid.cellSizeM.northSouth, eastWest: grid.cols * grid.cellSizeM.eastWest },
  };
}

/** Elevation above the lowest cell in the grid, metres, for a "relative low spots" shading. Same layout as the grid. */
export function relativeElevation(grid: TerrainGrid): number[] {
  let min = Infinity;
  for (const v of grid.elevationM) if (v < min) min = v;
  return grid.elevationM.map((v) => v - min);
}

/** 16-point compass name for an aspect in degrees (0 = north, clockwise). */
export function compassName(deg: number): string {
  const names = ["north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast", "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest"];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
