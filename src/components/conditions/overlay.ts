/**
 * Pure helpers for the map overlays: colour-blind-safe sequential bins, legends built from the real value range,
 * and the data shapes passed from the server to the map. No I/O, no DOM, no clock.
 */
import type { NdviGrid } from "@/lib/ndvi/types";
import type { TerrainGrid } from "@/lib/landform/types";
import { relativeElevation, slopePercentFromDegrees } from "@/lib/landform/terrain";

/** Six-step sequential palettes (viridis and cividis stops: readable by people with common colour-vision differences, and ordered by lightness). */
export const PALETTES = {
  viridis: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
  cividis: ["#00204d", "#31446b", "#666970", "#958f78", "#cbba69", "#ffea46"],
  magma: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
} as const;
export type PaletteName = keyof typeof PALETTES;
export const N_BINS = 6;

export type LegendBin = { index: number; from: number; to: number; label: string; colour: string };
export type Legend = { title: string; unit: string; min: number; max: number; digits: number; bins: LegendBin[]; palette: PaletteName };

export function minMax(values: ReadonlyArray<number | null>): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : { min, max };
}

export function binIndex(v: number, min: number, max: number, n = N_BINS): number {
  if (!(max > min)) return 0;
  const i = Math.floor(((v - min) / (max - min)) * n);
  return Math.max(0, Math.min(n - 1, i));
}

const fmt = (v: number, digits: number) => v.toFixed(digits);

/** Equal-width bins between the real minimum and maximum of the data shown. */
export function buildLegend(values: ReadonlyArray<number | null>, o: { title: string; unit: string; digits: number; palette: PaletteName }): Legend | null {
  const mm = minMax(values);
  if (!mm) return null;
  const step = (mm.max - mm.min) / N_BINS;
  const bins: LegendBin[] = Array.from({ length: N_BINS }, (_, i) => {
    const from = mm.min + step * i;
    const to = i === N_BINS - 1 ? mm.max : mm.min + step * (i + 1);
    return { index: i, from, to, label: mm.max > mm.min ? `${fmt(from, o.digits)} to ${fmt(to, o.digits)}` : `${fmt(from, o.digits)} (all the same)`, colour: PALETTES[o.palette][i] };
  });
  return { ...o, min: mm.min, max: mm.max, bins };
}

export function colourOf(legend: Legend, v: number): { index: number; colour: string; label: string } {
  const index = binIndex(v, legend.min, legend.max);
  return { index, colour: legend.bins[index].colour, label: legend.bins[index].label };
}

// ------------------------------------------------------------------ data passed to the client map

export type Bounds = { west: number; south: number; east: number; north: number };

export type NdviOverlayData = {
  bounds: Bounds;
  rows: number;
  cols: number;
  pixelSizeM: number;
  /** One legend over every date, so colours mean the same thing on every date. */
  legend: Legend;
  dates: { date: string; satellite: string; validFraction: number; values: (number | null)[] }[];
  originLine: string;
  extentM: { eastWest: number; northSouth: number };
};

export type TerrainOverlayData = {
  bounds: Bounds;
  rows: number;
  cols: number;
  cellSizeM: { northSouth: number; eastWest: number };
  slopePct: number[];
  relElevM: number[];
  elevationM: number[];
  slopeLegend: Legend;
  lowSpotLegend: Legend;
  originLine: string;
  extentM: { eastWest: number; northSouth: number };
};

export function buildNdviOverlay(grids: NdviGrid[], originLine: string): NdviOverlayData | null {
  if (grids.length === 0) return null;
  const sorted = [...grids].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const flat = sorted.map((g) => g.ndvi.flat());
  const legend = buildLegend(flat.flat(), { title: "Landsat NDVI", unit: "NDVI", digits: 2, palette: "viridis" });
  if (!legend) return null;
  return {
    bounds: first.bounds,
    rows: first.rows,
    cols: first.cols,
    pixelSizeM: first.pixelSizeM,
    legend,
    dates: sorted.map((g, i) => ({ date: g.date, satellite: g.satellite, validFraction: g.validFraction, values: flat[i] })),
    originLine,
    extentM: { eastWest: first.cols * first.pixelSizeM, northSouth: first.rows * first.pixelSizeM },
  };
}

export function buildTerrainOverlay(grid: TerrainGrid, originLine: string): TerrainOverlayData | null {
  const slopePct = grid.slopeDeg.map(slopePercentFromDegrees);
  const relElevM = relativeElevation(grid);
  const slopeLegend = buildLegend(slopePct, { title: "Slope", unit: "percent", digits: 1, palette: "magma" });
  const lowSpotLegend = buildLegend(relElevM, { title: "Height above the lowest cell in the window", unit: "m", digits: 1, palette: "cividis" });
  if (!slopeLegend || !lowSpotLegend) return null;
  return {
    bounds: grid.bounds,
    rows: grid.rows,
    cols: grid.cols,
    cellSizeM: grid.cellSizeM,
    slopePct,
    relElevM,
    elevationM: grid.elevationM,
    slopeLegend,
    lowSpotLegend,
    originLine,
    extentM: { eastWest: grid.cols * grid.cellSizeM.eastWest, northSouth: grid.rows * grid.cellSizeM.northSouth },
  };
}

/** Which cell of a row-major grid holds a lon/lat, or null outside its bounds. Row 0 is north. */
export function cellAt(b: Bounds, rows: number, cols: number, lat: number, lon: number): { row: number; col: number } | null {
  if (lat < b.south || lat > b.north || lon < b.west || lon > b.east) return null;
  const col = Math.min(cols - 1, Math.floor(((lon - b.west) / (b.east - b.west)) * cols));
  const row = Math.min(rows - 1, Math.floor(((b.north - lat) / (b.north - b.south)) * rows));
  return { row, col };
}

/** Plain sentence about low spots. Says what the map shows and what it does not. */
export const LOW_SPOT_SENTENCE =
  "This map shows ground height relative to the lowest cell in the window. Cold air tends to collect in low spots, as a general background fact; this app does not measure or map frost zones within a field.";
export const NDVI_OVERLAY_LABEL = "Real Landsat pixels (30 m) around this point, not a field boundary.";
export const TERRAIN_OVERLAY_LABEL = "NASADEM terrain model (SRTM-derived), about 31 m; a surface model, so buildings and trees raise it.";
