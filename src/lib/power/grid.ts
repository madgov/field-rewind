/** Round to the nearest 0.5; exact ties (x.25, x.75) round away from zero. Never returns -0. */
export function roundToHalf(x: number): number {
  const r = (Math.sign(x) * Math.round(Math.abs(x) * 2)) / 2;
  return r === 0 ? 0 : r;
}

export type GridCell = { key: string; latCenter: number; lonCenter: number };

/** 0.5-degree cell containing the point; key like "38.0_-121.5". */
export function gridCell(lat: number, lon: number): GridCell {
  const latCenter = roundToHalf(lat);
  const lonCenter = roundToHalf(lon);
  return { key: `${latCenter.toFixed(1)}_${lonCenter.toFixed(1)}`, latCenter, lonCenter };
}

/** Returns an error string, or null when the coordinates are valid. */
export function validateCoordinates(lat: unknown, lon: unknown): string | null {
  if (typeof lat !== "number" || !Number.isFinite(lat)) return `Invalid latitude: ${String(lat)} is not a finite number.`;
  if (typeof lon !== "number" || !Number.isFinite(lon)) return `Invalid longitude: ${String(lon)} is not a finite number.`;
  if (lat < -90 || lat > 90) return `Invalid latitude ${lat}: must be between -90 and 90.`;
  if (lon < -180 || lon > 180) return `Invalid longitude ${lon}: must be between -180 and 180.`;
  return null;
}
