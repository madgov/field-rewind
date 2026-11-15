import type { Crop } from "../crops/types";

/** First and last season (harvest) years. 40 seasons. */
export const FIRST_SEASON = 1986;
export const LAST_SEASON = 2025;
export const SEASON_COUNT = LAST_SEASON - FIRST_SEASON + 1;

/** A season is judged "insufficient data" when more than this many of its days have no ET0. */
export const MAX_MISSING_SEASON_DAYS = 10;

export const DECADES = [
  { label: "1986–1995", startYear: 1986, endYear: 1995 },
  { label: "1996–2005", startYear: 1996, endYear: 2005 },
  { label: "2006–2015", startYear: 2006, endYear: 2015 },
  { label: "2016–2025", startYear: 2016, endYear: 2025 },
] as const;

export const EXAMPLE_LABEL = "Constructed example, not records of a real farm.";

export type StageName = "ini" | "dev" | "mid" | "late";

/** A catalog crop with every value needed by the replay present (no nulls). */
export type ResolvedCrop = {
  id: string;
  name: string;
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  /** Stage lengths in days */
  stageDays: Record<StageName, number>;
  /** "MM-DD" */
  plantingDate: string;
  heatThresholdC: number;
  /** The catalog's own flag, kept so a disagreement with the dates can be surfaced. */
  spansNewYearFlag: boolean;
  source: Crop;
};

export type StageDates = { stage: StageName; startDate: string; endDate: string; days: number };

export type SeasonDates = {
  /** Harvest year: the year in which the season ends. */
  year: number;
  plantingDate: string;
  endDate: string;
  lengthDays: number;
  plantedInPreviousYear: boolean;
  stages: Record<StageName, StageDates>;
  /** Day numbers (days since 1970-01-01, UTC) for fast indexing. */
  startDayNum: number;
  endDayNum: number;
};

export type SeasonStatus = "evaluated" | "insufficient-data";
export type SeasonOutcome = "short" | "ok";

/** Supply-independent part of a season's evaluation. */
export type SeasonNeed = {
  year: number;
  cropId: string;
  cropName: string;
  status: SeasonStatus;
  /** Why the season is grey. Present only when status is "insufficient-data". */
  reason?: string;
  plantingDate: string;
  endDate: string;
  lengthDays: number;
  /** Crop water demand, mm. Null when insufficient-data. */
  etcMm: number | null;
  /** Effective rainfall attributed to the season, mm. Null when insufficient-data. */
  effectiveRainMm: number | null;
  /** max(0, ETc - effective rain), mm. Null when insufficient-data. */
  needMm: number | null;
  /** Days with tMax above the crop's heat threshold (information only; never changes the result). Null when insufficient-data. */
  heatDays: number | null;
  heatThresholdC: number;
  /** Season days with no ET0 (so no ETc). */
  missingEt0Days: number;
  /** Season days with no precipitation value. */
  missingPrecipSeasonDays: number;
  /** Days with no precipitation value in all calendar months the season touches (the months used for effective rainfall). */
  missingPrecipMonthDays: number;
  /** Season days with no daily maximum temperature. */
  missingTMaxDays: number;
};

export type SeasonResult = SeasonNeed & {
  supplyMm: number;
  /** "short" (red): need greater than supply. "ok" (green) otherwise. Null (grey) when insufficient-data. */
  outcome: SeasonOutcome | null;
  /** supply - need, mm. Negative when short. Null when grey. */
  marginMm: number | null;
  /** need / supply (gauge fill; above 1 means short). Null when grey or when supply is 0. */
  needFractionOfSupply: number | null;
};

export type DecadeCount = {
  label: string;
  startYear: number;
  endYear: number;
  seasons: number;
  short: number;
  ok: number;
  insufficient: number;
  /** short + ok: the seasons that could be judged. */
  evaluable: number;
};

export type RotationTotals = {
  short: number;
  ok: number;
  insufficient: number;
  evaluable: number;
  needMinMm: number | null;
  needMedianMm: number | null;
  needMaxMm: number | null;
};

export type RotationOverlap = {
  /** Season years of the two consecutive seasons. */
  fromYear: number;
  toYear: number;
  fromCropId: string;
  toCropId: string;
  overlapDays: number;
};

export type RotationInput = { name: string; sequence: string[] };

export type RotationResult = {
  name: string;
  sequence: string[];
  cropNames: string[];
  /** Exactly 40 results, 1986 to 2025 in order. */
  seasons: SeasonResult[];
  decades: DecadeCount[];
  totals: RotationTotals;
  headline: string;
  sentence: string;
  /** Fixed honesty note about small samples. */
  caveat: string;
  overlaps: RotationOverlap[];
  /** Plain-English warnings: overlapping seasons, flag disagreements. */
  warnings: string[];
};

export type ReplayInput = { rotations: RotationInput[]; supplyMm: number };

export type ReplayOk = {
  status: "ok";
  supplyMm: number;
  rotations: RotationResult[];
  /** Notes that apply to the whole run (missing data, approximations). */
  notes: string[];
  /** Where the climate data came from, worded per the project rule: saved/cached data always says "saved response from [date]". */
  dataLabel: string;
};

export type ReplayUnavailable = {
  status: "unavailable";
  /** "power-data": the climate record cannot be used. "invalid-input": the request itself is not valid. */
  cause: "power-data" | "invalid-input";
  reason: string;
  /** All individual problems when cause is "invalid-input". */
  problems: string[];
  nextStep: string;
};

export type ReplayResult = ReplayOk | ReplayUnavailable;
