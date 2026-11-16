import { DEMO_PINS } from "../demoPins";

export type LandformPoint = { id: string; name: string; lat: number; lon: number; kind: "demo-pin" | "sample-point" };

/** Extra sample point (not a demo pin): a real sloped agricultural area in the Sierra Nevada foothills. */
export const SAMPLE_POINTS: LandformPoint[] = [
  { id: "orange-cove", name: "Orange Cove foothills, CA (sample point, not a demo pin)", lat: 36.68, lon: -119.28, kind: "sample-point" },
];

export const LANDFORM_POINTS: LandformPoint[] = [...DEMO_PINS.map((p) => ({ ...p, kind: "demo-pin" as const })), ...SAMPLE_POINTS];

/** Saved points are matched by position (about 100 m), never by name. */
export const SAVED_MATCH_DEG = 0.001;

export function findSavedPoint(lat: number, lon: number): LandformPoint | null {
  return LANDFORM_POINTS.find((p) => Math.abs(p.lat - lat) <= SAVED_MATCH_DEG && Math.abs(p.lon - lon) <= SAVED_MATCH_DEG) ?? null;
}
