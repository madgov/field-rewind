/** Normalized extra NASA POWER fields. null = missing (POWER fill value -999 or absent). */
export type ExtraField =
  | "soilRootWetness"
  | "soilTopWetness"
  | "soilProfileWetness"
  | "dewPointC"
  | "skinTempC"
  | "evapLandMm"
  | "pressureKPa"
  | "frostFlag";

export type PowerExtraDay = { date: string } & Record<ExtraField, number | null>;

export type PowerExtraStatus = "ok" | "partial" | "no-coverage" | "error";

export type PowerExtraResult = {
  status: PowerExtraStatus;
  lat: number;
  lon: number;
  /** 0.5-degree cache cell containing the point (same keying as src/lib/power). */
  gridCell: { key: string; latCenter: number; lonCenter: number };
  /** Unit string per field as reported by NASA POWER (e.g. soil wetness "1", frost flag "Days"). */
  units: Record<ExtraField, string>;
  requested: { start: string; end: string };
  /** First and last date with at least one non-missing value; null when there is none. */
  coverage: { start: string; end: string } | null;
  missing: Record<ExtraField, number> & { anyField: number; totalDays: number };
  /** When the data was really fetched from NASA POWER. */
  fetchedAt: string;
  sourceUrls: string[];
  /** "live" = fetched in this request; "cache" = runtime cache; "saved" = committed saved response. */
  origin: "live" | "cache" | "saved";
  days: PowerExtraDay[];
  message?: string;
};

/** Wrapper stored on disk (saved files and runtime cache); same shape as the main POWER saved files. */
export type { PowerSavedFile as PowerExtraSavedFile } from "../power/rawTypes";
