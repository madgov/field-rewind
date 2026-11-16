import type { Crop } from "../crops/types";
import { parseMonthDay } from "./dates";
import type { ResolvedCrop } from "./types";

/** A season longer than this overlaps itself in the next year, which the replay does not model. */
export const MAX_SEASON_DAYS = 365;

export type ResolveResult = { ok: true; crop: ResolvedCrop } | { ok: false; reason: string };

/**
 * Turns a catalog crop into a crop with no unknowns. A crop with any unknown (null) value
 * needed for the replay is rejected with the list of what is missing: the app never guesses.
 */
export function resolveCrop(crop: Crop): ResolveResult {
  const missing: string[] = [];
  const need = <T>(label: string, v: T | null): T | null => {
    if (v === null || v === undefined) missing.push(label);
    return v ?? null;
  };
  const kcIni = need("Kc ini", crop.kc.ini.value);
  const kcMid = need("Kc mid", crop.kc.mid.value);
  const kcEnd = need("Kc end", crop.kc.end.value);
  const ini = need("initial stage days", crop.stageDays.ini.value);
  const dev = need("development stage days", crop.stageDays.dev.value);
  const mid = need("mid-season days", crop.stageDays.mid.value);
  const late = need("late-season days", crop.stageDays.late.value);
  const plant = need("default planting date", crop.planting.defaultDate.value);
  // Optional: the heat threshold only feeds the information-only hot-day count. Unknown stays null, never guessed.
  const heat = crop.heatThresholdC.value ?? null;
  // Not used by the replay arithmetic, but a crop with an unsourced planting window is excluded, same as the crop catalog's own usability rule.
  need("planting window start", crop.planting.windowStart.value);
  need("planting window end", crop.planting.windowEnd.value);
  if (missing.length) {
    return { ok: false, reason: `${crop.name} has no sourced value for: ${missing.join(", ")}.` };
  }
  const nums: [string, number][] = [
    ["Kc ini", kcIni as number],
    ["Kc mid", kcMid as number],
    ["Kc end", kcEnd as number],
  ];
  if (heat !== null) nums.push(["heat threshold", heat]);
  for (const [label, v] of nums) {
    if (!Number.isFinite(v)) return { ok: false, reason: `${crop.name}: ${label} is not a finite number.` };
  }
  for (const [label, v] of [
    ["Kc ini", kcIni as number],
    ["Kc mid", kcMid as number],
    ["Kc end", kcEnd as number],
  ] as [string, number][]) {
    if (v < 0) return { ok: false, reason: `${crop.name}: ${label} is negative.` };
  }
  const days = { ini: ini as number, dev: dev as number, mid: mid as number, late: late as number };
  for (const [k, v] of Object.entries(days)) {
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, reason: `${crop.name}: ${k} stage length must be a whole number of days, 0 or more (got ${v}).` };
    }
  }
  const total = days.ini + days.dev + days.mid + days.late;
  if (total < 1) return { ok: false, reason: `${crop.name}: the stage lengths add up to 0 days.` };
  if (total > MAX_SEASON_DAYS) {
    return {
      ok: false,
      reason: `${crop.name}: the season is ${total} days long; the replay handles seasons of at most ${MAX_SEASON_DAYS} days (a longer crop would overlap its own next season).`,
    };
  }
  const md = parseMonthDay(plant as string);
  if (!md) return { ok: false, reason: `${crop.name}: planting date "${plant}" is not a valid MM-DD date.` };
  if (md.month === 2 && md.day === 29) {
    return {
      ok: false,
      reason: `${crop.name}: a 29 February planting date does not exist in 3 of every 4 years, and the replay never moves a planting date. Choose another default date.`,
    };
  }
  return {
    ok: true,
    crop: {
      id: crop.id,
      name: crop.name,
      kcIni: kcIni as number,
      kcMid: kcMid as number,
      kcEnd: kcEnd as number,
      stageDays: days,
      plantingDate: plant as string,
      heatThresholdC: heat,
      spansNewYearFlag: crop.spansNewYear,
      source: crop,
    },
  };
}
