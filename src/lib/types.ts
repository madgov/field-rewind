/** One day of normalized NASA POWER data. null = missing (POWER fill value -999 or absent). */
export type DailyRecord = {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** T2M_MAX, degrees C */
  tMaxC: number | null;
  /** T2M_MIN, degrees C */
  tMinC: number | null;
  /** RH2M, percent */
  rhPct: number | null;
  /** WS2M, m/s at 2 m */
  wind2mMs: number | null;
  /** ALLSKY_SFC_SW_DWN, MJ/m^2/day */
  solarMJm2: number | null;
  /** PRECTOTCORR, mm/day */
  precipMm: number | null;
};

export type PowerField = Exclude<keyof DailyRecord, "date">;

export type PowerStatus = "ok" | "partial" | "no-coverage" | "error";

export type PowerResult = {
  status: PowerStatus;
  /** Requested point */
  lat: number;
  lon: number;
  /** 0.5-degree cache cell containing the point */
  gridCell: { key: string; latCenter: number; lonCenter: number };
  /** Elevation reported by POWER for the grid cell, metres. null if unknown. */
  elevationM: number | null;
  /** Unit string per field, as reported by POWER, e.g. { tMaxC: "C", solarMJm2: "MJ/m^2/day" } */
  units: Record<PowerField, string>;
  requested: { start: string; end: string };
  /** First and last date having at least one non-missing value. null when there is none. */
  coverage: { start: string; end: string } | null;
  /** Count of days where each field is missing, plus days where any field is missing. */
  missing: Record<PowerField, number> & { anyField: number; totalDays: number };
  /** ISO timestamp of when the data was actually fetched from NASA POWER. */
  fetchedAt: string;
  /** Exact request URLs sent to NASA POWER. */
  sourceUrls: string[];
  /** "live" = fetched in this request; "cache" = runtime cache; "saved" = committed saved response. */
  origin: "live" | "cache" | "saved";
  days: DailyRecord[];
  /** Present when status is "error" or "no-coverage", and for "partial" to explain what is missing. */
  message?: string;
};
