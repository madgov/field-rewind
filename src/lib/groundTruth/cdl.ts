import proj4 from "proj4";
import type { CdlPixel, CdlYear } from "./types";

proj4.defs("EPSG:5070", "+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs");

export const CDL_FIRST_YEAR = 2008;
export const CDL_LAST_YEAR = 2024;
export const CDL_PIXEL_M = 30;

/** lon/lat (WGS84) to NAD83 CONUS Albers metres (EPSG:5070). */
export function toAlbers(lat: number, lon: number): { x: number; y: number } {
  const [x, y] = proj4("EPSG:4326", "EPSG:5070", [lon, lat]) as [number, number];
  return { x, y };
}

/** 3 x 3 block of query points, 30 m apart, centre first. */
export function blockPoints(x: number, y: number, size = 3): { x: number; y: number; centre: boolean }[] {
  const half = (size - 1) / 2;
  const pts: { x: number; y: number; centre: boolean }[] = [{ x, y, centre: true }];
  for (let i = -half; i <= half; i++) for (let j = -half; j <= half; j++) if (i !== 0 || j !== 0) pts.push({ x: x + i * CDL_PIXEL_M, y: y + j * CDL_PIXEL_M, centre: false });
  return pts;
}

/** Parse the GetCDLValue XML. Returns null when the response carries no value. */
export function parseCdlValue(xml: string): CdlPixel | null {
  const m = /value:\s*(\d+)\s*,\s*category:\s*"([^"]*)"/.exec(xml);
  if (!m) return null;
  return { value: Number(m[1]), category: m[2] as string };
}

/**
 * Majority vote for one year. `pixels` are the answered pixels (centre first if known). Ties are resolved by the centre
 * pixel when it is among the tied classes, else by the lowest class code; `tie` is set either way.
 */
export function majorityVote(year: number, pixels: readonly CdlPixel[], centre: CdlPixel | null): CdlYear {
  const counts = new Map<number, { count: number; category: string }>();
  for (const p of pixels) {
    const c = counts.get(p.value) ?? { count: 0, category: p.category };
    c.count++;
    counts.set(p.value, c);
  }
  const countsByName: Record<string, number> = {};
  for (const c of counts.values()) countsByName[c.category] = (countsByName[c.category] ?? 0) + c.count;
  if (!counts.size) return { year, majority: null, sampled: 0, agree: 0, tie: false, centre, counts: countsByName };
  const top = Math.max(...[...counts.values()].map((c) => c.count));
  const tied = [...counts.entries()].filter(([, c]) => c.count === top).map(([v]) => v);
  const tie = tied.length > 1;
  const winner = tie ? (centre && tied.includes(centre.value) ? centre.value : Math.min(...tied)) : (tied[0] as number);
  const w = counts.get(winner) as { count: number; category: string };
  return { year, majority: { value: winner, category: w.category }, sampled: pixels.length, agree: w.count, tie, centre, counts: countsByName };
}
