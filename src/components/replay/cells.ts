/**
 * Display helpers for the replay screen. None of these decides short / ok / grey: that comes from the engine's
 * `outcome`. They only map engine fields to shapes, labels and gauge geometry.
 */
import type { DecadeCount, SeasonResult } from "@/lib/replay/types";
import { formatInches, formatMm } from "@/lib/shift/units";

export type CellKind = "short" | "ok" | "grey";

export function cellKind(s: Pick<SeasonResult, "outcome">): CellKind {
  return s.outcome === "short" ? "short" : s.outcome === "ok" ? "ok" : "grey";
}

/** Short mark for each crop, from its plain name: the first letter, or two letters if two crops would share one. */
export function cropAbbreviations(crops: { id: string; name: string }[]): Record<string, string> {
  const first = (n: string) => (n.match(/[A-Za-z]/)?.[0] ?? "?").toUpperCase();
  const counts = new Map<string, number>();
  for (const c of crops) counts.set(first(c.name), (counts.get(first(c.name)) ?? 0) + 1);
  const out: Record<string, string> = {};
  for (const c of crops) {
    const letters = c.name.replace(/[^A-Za-z]/g, "");
    out[c.id] = (counts.get(first(c.name)) ?? 0) > 1 ? letters.slice(0, 2).toLowerCase().replace(/^./, (x) => x.toUpperCase()) : first(c.name);
  }
  return out;
}

/** "2 of 10 short", or "2 of 9 short, 1 not judged" when some seasons are grey. Numbers come straight from the decade counts. */
export function decadeCountText(d: DecadeCount): string {
  const base = `${d.short} of ${d.evaluable} short`;
  return d.insufficient > 0 ? `${base}, ${d.insufficient} not judged` : base;
}

export function cellLabel(s: SeasonResult): string {
  const what = s.outcome === "short" ? "short of water" : s.outcome === "ok" ? "water supply covers it" : "not enough data to judge";
  return `${s.year}, ${s.cropName}: ${what}`;
}

/** Gauge geometry in percent of the tank height. The supply line sits at SUPPLY_LINE_PCT; the fill is need as a share of supply. */
export const SUPPLY_LINE_PCT = 68;
const MAX_FRACTION = 1.45;

/** A short season always shows at least this much water above the supply line, so a near miss (a few mm) still reads as "over". Display only. */
export const MIN_VISIBLE_OVER_PCT = 4;

export type GaugeShape = {
  /** 0..100: height of the water */
  fillPct: number;
  /** blue part (up to the supply line) */
  basePct: number;
  /** red part above the supply line */
  overPct: number;
  /** true when the need is larger than the vessel can draw */
  clipped: boolean;
  /** true when the red part was drawn taller than its true size so a near miss stays visible */
  minimumApplied: boolean;
};

export function gaugeShape(s: Pick<SeasonResult, "needMm" | "supplyMm" | "needFractionOfSupply" | "outcome">): GaugeShape {
  if (s.outcome === null || s.needMm === null) return { fillPct: 0, basePct: 0, overPct: 0, clipped: false, minimumApplied: false };
  // Supply 0: the engine gives no fraction. Any need at all overflows the (empty) line; no need leaves it empty.
  const f = s.needFractionOfSupply ?? (s.needMm > 0 ? MAX_FRACTION : 0);
  const clipped = f > MAX_FRACTION;
  const c = Math.min(f, MAX_FRACTION);
  const fillPct = Math.min(100, c * SUPPLY_LINE_PCT);
  const basePct = Math.min(fillPct, SUPPLY_LINE_PCT);
  const over = Math.max(0, fillPct - SUPPLY_LINE_PCT);
  const overPct = s.outcome === "short" ? Math.max(over, MIN_VISIBLE_OVER_PCT) : over;
  return { fillPct: basePct + overPct, basePct, overPct, clipped, minimumApplied: s.outcome === "short" && over < MIN_VISIBLE_OVER_PCT };
}

/** Whole mm with inches derived from that same whole-mm number, so the two always agree. */
export const mmWithInches = (mm: number) => {
  const whole = Math.round(mm);
  return `${formatMm(whole)} (${formatInches(whole)})`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2025-10-15" -> "15 Oct 2025" (no time zones involved). */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** True when the planting date falls in the year before the harvest year (for example winter wheat). */
export function plantedYearBefore(s: Pick<SeasonResult, "plantingDate" | "year">): boolean {
  return Number(s.plantingDate.slice(0, 4)) < s.year;
}
