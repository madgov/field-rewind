import type { SmapObservation } from "./types";

/** v006 User Guide, Table 6: bits 0/1/2 must be clear. Flag 8 is acceptable for soil moisture. */
export function smapQuality(raw: number | null, flag: number | null): Pick<SmapObservation, "valueM3M3" | "rawValueM3M3" | "retrievalQualityFlag" | "quality"> {
  const value = raw !== null && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
  const qa = flag !== null && Number.isInteger(flag) && flag >= 0 && flag <= 15 ? flag : null;
  const good = value !== null && qa !== null && (qa & 7) === 0;
  return { valueM3M3: good ? value : null, rawValueM3M3: value, retrievalQualityFlag: qa, quality: good ? "recommended" : value === null || qa === null ? "missing" : "not-recommended" };
}

export function monthlyRainMm(month: string, rateMmPerHour: number | null): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("IMERG month must be YYYY-MM.");
  if (rateMmPerHour === null || !Number.isFinite(rateMmPerHour) || rateMmPerHour < 0) return null;
  const [year, m] = month.split("-").map(Number);
  return rateMmPerHour * 24 * new Date(Date.UTC(year, m, 0)).getUTCDate();
}
