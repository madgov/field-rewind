import { QA_REJECT_BITS, SR_DN_MAX, SR_DN_MIN, SR_OFFSET, SR_SCALE } from "./constants";

/** Landsat Collection 2 Level-2 DN to surface reflectance. */
export function toReflectance(dn: number): number {
  return dn * SR_SCALE + SR_OFFSET;
}

/** True when the DN is inside the USGS valid surface-reflectance range (1..65455). */
export function srDnValid(dn: number): boolean {
  return dn >= SR_DN_MIN && dn <= SR_DN_MAX;
}

/** True when a QA_PIXEL value flags fill, dilated cloud, cirrus, cloud, cloud shadow or snow. */
export function qaRejects(qa: number): boolean {
  return QA_REJECT_BITS.some((bit) => (qa & (1 << bit)) !== 0);
}

/** NDVI = (NIR - Red) / (NIR + Red) on surface reflectance. Returns null when the sum is not positive. */
export function ndviFromReflectance(red: number, nir: number): number | null {
  const s = nir + red;
  if (!(s > 0)) return null;
  return (nir - red) / s;
}

/**
 * NDVI of one pixel from raw DN values and the QA band. null = rejected (QA flag, invalid DN range).
 * Valid DN range is checked on both bands before scaling.
 */
export function ndviFromDn(redDn: number, nirDn: number, qa: number): number | null {
  if (qaRejects(qa)) return null;
  if (!srDnValid(redDn) || !srDnValid(nirDn)) return null;
  const v = ndviFromReflectance(toReflectance(redDn), toReflectance(nirDn));
  if (v === null || !Number.isFinite(v)) return null;
  return Math.max(-1, Math.min(1, v));
}

export const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** "landsat-8" -> "Landsat 8" */
export function satelliteName(platform: string | undefined): string {
  const m = /landsat[-_ ]?(\d)/i.exec(platform ?? "");
  return m ? `Landsat ${m[1]}` : platform ? String(platform) : "Landsat (unknown)";
}
