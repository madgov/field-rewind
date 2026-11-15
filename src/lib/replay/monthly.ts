/**
 * Monthly modelled crop water use, for comparing with OpenET (observed monthly ET) in the "How we know" panel.
 *
 *   modelled crop water use of a month = sum over the month's days of Kc(day) x ET0(day)    (mm)
 *
 * It uses the engine's own pieces and no re-implemented rules: seasonDates() for the dates, kcCurve() for Kc, and the
 * prepared ET0 array from climate.ts. The crop for each season year comes from cropIndexForYear() (the rotation rule).
 *
 * WHICH MONTHS HAVE A VALUE (decision, see docs/replay-method.md):
 *  - A month gets a number only when it is covered by a season on EVERY day, with no day counted twice and no ET0 day
 *    missing. Anything else is null, never zero and never a partial sum.
 *  - Months outside every season are null, NOT zero. A fallow month's real water use is not zero (bare soil still
 *    evaporates, weeds grow), and OpenET measures it, so writing 0 would invent a gap of exactly the size of OpenET's
 *    value. Those months are simply not compared. "No modelled value" is the honest statement: the app has no crop there.
 *  - A month only partly inside a season (planting or harvest mid-month) is null too: comparing a part-month sum with a
 *    whole-month satellite value would make the model look low for a reason that has nothing to do with the crop.
 *  - Where two seasons overlap in dates (the replay lets them overlap, counting the days in both), the month is null:
 *    one pixel cannot grow two crops, so the sum would be meaningless as a comparison.
 */
import type { Crop } from "../crops/types";
import { cropIndexForYear } from "./assemble";
import type { PreparedClimate } from "./climate";
import { dayNum, daysInMonth, monthKeyOfDayNum } from "./dates";
import { resolveCropCached } from "./evaluate";
import { kcCurve } from "./kc";
import { seasonDates } from "./season";
import type { ResolvedCrop } from "./types";

/** The part of one season that falls in one calendar month. Plain data, safe to send to the browser. */
export type MonthPiece = {
  /** "YYYY-MM" */
  month: string;
  /** Day numbers (days since 1970-01-01 UTC) of the first and last season day in this month. */
  startDay: number;
  endDay: number;
  /** Sum of Kc x ET0 over the season days in this month that have an ET0 value, mm. */
  etcMm: number;
  /** Season days in this month with no ET0 value (never filled). */
  missingEt0Days: number;
};

/** crop id -> harvest year -> pieces of that season, month by month. */
export type MonthlyTable = Record<string, Record<number, MonthPiece[]>>;

export type MonthlyUse = {
  month: string;
  /** Modelled crop water use for the whole month, mm. Null = no modelled value (see `why`). */
  mm: number | null;
  /** null when mm is set. Months outside every season are not listed at all (see the header). */
  why: "partial-month" | "overlap" | "missing-et0" | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const monthLabel = (key: number) => `${Math.floor(key / 12)}-${pad((key % 12) + 1)}`;

/** Pieces of the season ending in `year`, one per calendar month it touches. */
export function seasonMonthlyPieces(climate: PreparedClimate, crop: ResolvedCrop, year: number): MonthPiece[] {
  const dates = seasonDates(crop, year);
  const kc = kcCurve(crop);
  const byMonth = new Map<number, MonthPiece>();
  for (let d = dates.startDayNum; d <= dates.endDayNum; d++) {
    const key = monthKeyOfDayNum(d);
    let p = byMonth.get(key);
    if (!p) {
      p = { month: monthLabel(key), startDay: d, endDay: d, etcMm: 0, missingEt0Days: 0 };
      byMonth.set(key, p);
    }
    p.endDay = d;
    const off = d - climate.firstDay;
    const e = off >= 0 && off <= climate.lastDay - climate.firstDay ? climate.et0[off] : NaN;
    if (Number.isNaN(e)) p.missingEt0Days++;
    else p.etcMm += kc[d - dates.startDayNum] * e;
  }
  return [...byMonth.values()];
}

/** Pieces for every crop and every season year in [fromYear, toYear]. Server side: needs the prepared climate. */
export function buildMonthlyTable(climate: PreparedClimate, crops: Crop[], fromYear: number, toYear: number): MonthlyTable {
  const table: MonthlyTable = {};
  for (const crop of crops) {
    const r = resolveCropCached(crop);
    if (!r.ok) continue;
    const perYear: Record<number, MonthPiece[]> = {};
    for (let y = fromYear; y <= toYear; y++) perYear[y] = seasonMonthlyPieces(climate, r.crop, y);
    table[crop.id] = perYear;
  }
  return table;
}

/**
 * Monthly modelled crop water use of a rotation over the months its seasons touch, in time order. `sequence` is the
 * rotation's crop ids; season year Y uses sequence[(Y - 1986) mod length], exactly as the replay does.
 * Pure: needs only the table, so it also runs in the browser when the user edits a rotation.
 */
export function rotationMonthlyUse(table: MonthlyTable, sequence: string[], fromYear: number, toYear: number): MonthlyUse[] {
  if (sequence.length === 0) return [];
  const pieces = new Map<string, MonthPiece[]>();
  for (let y = fromYear; y <= toYear; y++) {
    const id = sequence[cropIndexForYear(sequence.length, y)];
    for (const p of table[id]?.[y] ?? []) {
      const list = pieces.get(p.month) ?? [];
      list.push(p);
      pieces.set(p.month, list);
    }
  }
  const out: MonthlyUse[] = [];
  for (const month of [...pieces.keys()].sort()) {
    const list = pieces.get(month)!.slice().sort((a, b) => a.startDay - b.startDay);
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const first = dayNum(y, m, 1);
    const last = dayNum(y, m, daysInMonth(y, m));
    let overlap = false;
    for (let i = 1; i < list.length; i++) if (list[i].startDay <= list[i - 1].endDay) overlap = true;
    const covered = list.reduce((s, p) => s + (p.endDay - p.startDay + 1), 0);
    const missing = list.reduce((s, p) => s + p.missingEt0Days, 0);
    if (overlap) out.push({ month, mm: null, why: "overlap" });
    else if (list[0].startDay !== first || list[list.length - 1].endDay !== last || covered !== last - first + 1) out.push({ month, mm: null, why: "partial-month" });
    else if (missing > 0) out.push({ month, mm: null, why: "missing-et0" });
    else out.push({ month, mm: list.reduce((s, p) => s + p.etcMm, 0), why: null });
  }
  return out;
}

export function monthlyWhyText(why: NonNullable<MonthlyUse["why"]>): string {
  switch (why) {
    case "partial-month": return "the season covers only part of this month";
    case "overlap": return "two seasons overlap in this month";
    case "missing-et0": return "some days of this month have no ET0 value";
  }
}
