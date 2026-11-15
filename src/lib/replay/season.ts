/**
 * Season dates. Seasons are labelled by HARVEST year Y: the planting date is the crop's default "MM-DD",
 * placed in whichever calendar year makes the season END (planting + total stage days - 1) fall in Y.
 * A normal crop is planted in Y; a crop whose season crosses 31 December is planted in Y-1.
 * All arithmetic is in UTC day numbers, so leap days inside a season are counted correctly.
 */
import { resolveCrop } from "./crop";
import type { Crop } from "../crops/types";
import { dayNum, dayNumToIso, parseMonthDay, yearOfDayNum } from "./dates";
import { FIRST_SEASON, LAST_SEASON, type ResolvedCrop, type SeasonDates, type StageDates, type StageName } from "./types";

const STAGES: StageName[] = ["ini", "dev", "mid", "late"];

function asResolved(crop: Crop | ResolvedCrop): ResolvedCrop {
  if ("kcIni" in crop) return crop;
  const r = resolveCrop(crop);
  if (!r.ok) throw new Error(r.reason);
  return r.crop;
}

export function seasonLength(c: ResolvedCrop): number {
  return c.stageDays.ini + c.stageDays.dev + c.stageDays.mid + c.stageDays.late;
}

/** Dates of the season that ends in `year` (the harvest year). Throws for a planting date that does not exist. */
export function seasonDates(cropIn: Crop | ResolvedCrop, year: number): SeasonDates {
  const c = asResolved(cropIn);
  const md = parseMonthDay(c.plantingDate);
  if (!md) throw new Error(`${c.name}: planting date "${c.plantingDate}" is not a valid MM-DD date.`);
  if (md.month === 2 && md.day === 29) {
    throw new Error(`${c.name}: 29 February planting is rejected (it does not exist in non-leap years and dates are never moved).`);
  }
  const length = seasonLength(c);

  // Try planting in the harvest year first, then the year before. For almost every crop exactly one fits.
  // Only a season that ends on or within a day of 31 December can fall between the two (e.g. a 365-day season planted
  // 2 January, in a year whose predecessor is a leap year); then no planting makes a season end in `year`.
  let plantYear = year;
  let start = dayNum(plantYear, md.month, md.day);
  if (yearOfDayNum(start + length - 1) !== year) {
    plantYear = year - 1;
    start = dayNum(plantYear, md.month, md.day);
  }
  const end = start + length - 1;
  if (yearOfDayNum(end) !== year) {
    throw new Error(
      `${c.name}: planted on ${c.plantingDate}, no season ends in ${year} (the season ends within a day of New Year and the leap day moves it across). The replay never moves a planting date.`,
    );
  }

  const stages = {} as Record<StageName, StageDates>;
  let cursor = start;
  for (const s of STAGES) {
    const days = c.stageDays[s];
    stages[s] = {
      stage: s,
      days,
      // A zero-length stage has no days; its dates then repeat the neighbouring day and days === 0 says so.
      startDate: dayNumToIso(cursor),
      endDate: dayNumToIso(days > 0 ? cursor + days - 1 : cursor - 1),
    };
    cursor += days;
  }
  return {
    year,
    plantingDate: dayNumToIso(start),
    endDate: dayNumToIso(end),
    lengthDays: length,
    plantedInPreviousYear: plantYear < year,
    stages,
    startDayNum: start,
    endDayNum: end,
  };
}

export type SpansFlagCheck = {
  /** What the dates say: true when the seasons are planted in the year before their harvest year. */
  derivedSpansNewYear: boolean;
  /** The catalog's own flag. */
  flag: boolean;
  agrees: boolean;
  message: string | null;
};

/** Compares the catalog's spansNewYear flag with what the dates imply. The dates win; a disagreement is surfaced, never hidden. */
export function checkSpansNewYear(cropIn: Crop | ResolvedCrop, firstYear = FIRST_SEASON, lastYear = LAST_SEASON): SpansFlagCheck {
  const c = asResolved(cropIn);
  let derived = false;
  for (let y = firstYear; y <= lastYear; y++) {
    if (seasonDates(c, y).plantedInPreviousYear) derived = true;
  }
  const agrees = derived === c.spansNewYearFlag;
  const message = agrees
    ? null
    : `${c.name}: the crop catalog says the season ${c.spansNewYearFlag ? "crosses" : "does not cross"} 31 December, but its planting date and stage lengths say it ${derived ? "does" : "does not"}. The replay follows the dates.`;
  return { derivedSpansNewYear: derived, flag: c.spansNewYearFlag, agrees, message };
}

/** Returns a problem description if any of the 40 seasons cannot be dated, else null. */
export function validateSeasonYears(cropIn: Crop | ResolvedCrop, firstYear = FIRST_SEASON, lastYear = LAST_SEASON): string | null {
  const c = asResolved(cropIn);
  for (let y = firstYear; y <= lastYear; y++) {
    try {
      seasonDates(c, y);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  return null;
}
