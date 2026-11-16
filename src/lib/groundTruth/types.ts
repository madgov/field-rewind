import type { PowerResult } from "../types";

/** Where one layer's numbers came from and how to cite it. */
export type SourceInfo = { name: string; citation: string; url: string; terms: string };

export type LayerStatus = "ok" | "no-coverage" | "error" | "not-checked";

/** One ground-truth layer. `data` is null unless status is "ok". `message` is always plain English. */
export type Layer<T> = {
  status: LayerStatus;
  message: string;
  data: T | null;
  source: SourceInfo;
  /** ISO time the data was fetched from the source (not the read time). */
  fetchedAt: string;
  /** Exact request URLs used (first few for multi-request layers). */
  requestUrls: string[];
};

/** Where a result came from: "live" = fetched in this request, "saved" = committed file. */
export type GroundOrigin = "live" | "saved";

// ---------------- Daymet vs POWER ----------------

export type DaymetDay = { date: string; prcpMm: number | null; tMaxC: number | null; tMinC: number | null };

export type PairStats = {
  n: number;
  /** Mean of the reference product (Daymet). */
  meanDaymet: number;
  meanPower: number;
  /** POWER minus Daymet, in the variable's unit. */
  bias: number;
  rmse: number;
  /** Pearson correlation. null when a series has no variation. */
  r: number | null;
  /** Squared Pearson correlation. null when r is null. */
  r2: number | null;
};

export type AnnualPrecipRow = { year: number; days: number; daymetMm: number; powerMm: number; diffMm: number; ratio: number | null };

export type DaymetComparison = {
  period: { start: string; end: string };
  /** Days where both products have a value. */
  pairedDays: number;
  /** Dec 31 of leap years: POWER has them, Daymet's 365-day calendar drops them. */
  droppedLeapDec31: number;
  /** Other dates present in POWER but missing in Daymet (should be 0). */
  otherUnmatchedDays: number;
  precipDaily: PairStats;
  precipAnnual: {
    rows: AnnualPrecipRow[];
    excludedYears: { year: number; pairedDays: number }[];
    meanDaymetMm: number;
    meanPowerMm: number;
    /** POWER minus Daymet, mm per year. */
    biasMmPerYear: number;
    /** Sum of POWER annual totals divided by sum of Daymet annual totals. */
    ratioOfTotals: number | null;
    r: number | null;
    r2: number | null;
  };
  tMax: PairStats;
  tMin: PairStats;
  daymetCell: { lat: number; lon: number; elevationM: number | null };
  power: { origin: "live" | "cache" | "saved"; fetchedAt: string };
};

// ---------------- CoCoRaHS gauge ----------------

export type GaugeReport = { date: string; precipMm: number | null };

export type GaugeStation = { id: string; name: string; lat: number; lon: number; status: string; distanceKm: number };

export type GaugeProductStats = {
  /** Days the gauge reported and the product has a value. */
  n: number;
  gaugeTotalMm: number;
  productTotalMm: number;
  /** Product minus gauge, mm per reported day. */
  biasMmPerDay: number;
  /** product total / gauge total on those days. null if gauge total is 0. */
  ratio: number | null;
  r: number | null;
  r2: number | null;
  /** Days at or above wetDayMm: both wet, gauge only wet, product only wet, both dry. */
  wetDays: { threshold: number; both: number; gaugeOnly: number; productOnly: number; neither: number };
};

export type GaugeComparison = {
  station: GaugeStation;
  /** How the station was chosen, in words. */
  selection: string;
  window: { start: string; end: string };
  /** Reports returned by CoCoRaHS in the window (including unreadable ones). */
  reportsReturned: number;
  /** Reports with a readable amount. */
  reportedDays: number;
  /** Days in the window with no report (not assumed to be zero rain). */
  daysWithoutReport: number;
  gaugeRainyDays: number;
  power: GaugeProductStats;
  daymet: GaugeProductStats;
};

// ---------------- Crop history ----------------

export type CdlPixel = { value: number; category: string };

export type CdlYear = {
  year: number;
  /** Most common class over the sampled pixels. null if no pixel answered. */
  majority: CdlPixel | null;
  /** Pixels that answered. */
  sampled: number;
  /** How many of the sampled pixels carry the majority class. */
  agree: number;
  /** True when two or more classes tied for most common (resolved by the centre pixel, else lowest code). */
  tie: boolean;
  centre: CdlPixel | null;
  /** Counts per category name. */
  counts: Record<string, number>;
};

export type CdlHistory = {
  years: CdlYear[];
  /** Pixels requested per year (9 = 3 x 3 block at 30 m spacing). */
  pixelsPerYear: number;
  failedRequests: number;
};

export type NlcdClass = { code: number; name: string; year: number };

// ---------------- Wells ----------------

export type WellReading = { date: string; value: number; unit: string; qualifier: string | null; approval: string | null };

export type WellFact = {
  id: string;
  name: string | null;
  distanceKm: number;
  readings: WellReading[];
  /** Total readings found in the query (capped by the query limit). */
  readingsReturned: number;
};

export type WellsFact = {
  parameterCode: "72019";
  /** Nearest well (within the search box) with any depth-to-water reading. */
  nearest: WellFact | null;
  /** Nearest well with a reading on or after `recentSince`. null when none, or when it is the same well as `nearest`. */
  nearestRecent: WellFact | null;
  recentSince: string;
  searchRadiusKm: number;
  sitesSearched: number;
};

// ---------------- Result ----------------

export type GroundTruthOk = {
  status: "ok";
  pinId: string | null;
  lat: number;
  lon: number;
  origin: GroundOrigin;
  /** Time the first layer was fetched, for headline labels. Each layer also carries its own. */
  fetchedAt: string;
  daymet: Layer<DaymetComparison>;
  gauge: Layer<GaugeComparison>;
  cdl: Layer<CdlHistory>;
  nlcd: Layer<NlcdClass>;
  wells: Layer<WellsFact>;
};

export type GroundTruthError = { status: "error"; lat: number; lon: number; message: string };

export type GroundTruthResult = GroundTruthOk | GroundTruthError;

/** Saved file shape: the ok result plus a schema marker. */
export type SavedGroundTruth = GroundTruthOk & { schema: 1 };

export type PowerLike = Pick<PowerResult, "days" | "origin" | "fetchedAt" | "status">;
