export type OpenEtStatus = "ok" | "partial" | "no-key" | "no-coverage" | "quota" | "error";

export type OpenEtErrorReason = "auth" | "validation" | "http" | "timeout" | "network" | "parse" | "shape" | "units" | "input";

export type OpenEtMonth = { month: string; etMm: number | null };

export type OpenEtCoverage = {
  requestedMonths: number;
  /** Months with a non-null value. */
  withData: number;
  /** Requested months that are absent or null. */
  missingMonths: string[];
  firstMonth: string | null;
  lastMonth: string | null;
  /** Months that are still provisional (last 120 days before the fetch time). */
  provisionalMonths: string[];
};

export type OpenEtRequestBody = {
  date_range: [string, string];
  interval: "monthly";
  geometry: [number, number];
  model: "Ensemble";
  variable: "ET";
  reference_et: "gridMET";
  units: "mm";
  file_format: "JSON";
};

export type OpenEtResult = {
  status: OpenEtStatus;
  /** Human-readable explanation for every non-ok status (and notes for partial). Never contains the key. */
  message: string | null;
  reason: OpenEtErrorReason | null;
  httpStatus: number | null;
  series: OpenEtMonth[];
  /** Units the response itself reported, or null if it did not state any. */
  unitsReported: string | null;
  unitsRequested: "mm";
  model: "Ensemble";
  variable: "ET";
  interval: "monthly";
  coverage: OpenEtCoverage | null;
  fetchedAt: string | null;
  sourceUrl: string;
};
