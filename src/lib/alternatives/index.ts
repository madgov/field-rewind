/**
 * "Crops that fit your water as the climate shifts". Every usable crop is modelled alone, every season 1986-2025, at one supply,
 * on the real record and on two what-ifs of that record (2 C warmer, 20 percent less rain) made by the existing scenario engine.
 * Pure: the caller passes the POWER data and the crops. Water need only: no yield, price, pests or markets.
 */
import type { Crop } from "../crops/types";
import { buildSeasonTable } from "../replay/replay";
import { judgeSeason } from "../replay/evaluate";
import { DECADES, FIRST_SEASON, LAST_SEASON } from "../replay/types";
import type { SeasonNeed } from "../replay/types";
import { scenarioPower } from "../scenario/transform";
import type { Scenario } from "../scenario/types";
import type { PowerResult } from "../types";

export const WARMER: Scenario = { rainFactor: 1, tempDeltaC: 2, humidity: "hold-vapour-pressure" };
export const DRIER: Scenario = { rainFactor: 0.8, tempDeltaC: 0, humidity: "hold-vapour-pressure" };

/** A crop needs at least this many judged seasons in the last decade to be ranked. */
export const MIN_LAST_DECADE_SEASONS = 8;

export const PLANTING_NOTE =
  "Planting months come from the FAO-56 table row for each crop and may not match local practice. Compare crops within the same season.";

/** Below this median need the line says rain covered the modelled need, never that the crop "needs no water". */
export const RAIN_COVERED_MM = 50;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type SeasonGroupId = "cool" | "warm";
export const SEASON_GROUPS: Record<SeasonGroupId, string> = {
  cool: "Planted September to February",
  warm: "Planted March to August",
};

/** Month index 0-11 from a "MM-DD" default planting date, or null when missing. */
export function plantingMonthIndex(crop: Crop): number | null {
  const v = crop.planting?.defaultDate?.value;
  const m = typeof v === "string" ? Number(v.slice(0, 2)) : NaN;
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m - 1 : null;
}

export function seasonGroupOf(monthIndex: number): SeasonGroupId {
  return monthIndex >= 2 && monthIndex <= 7 ? "warm" : "cool";
}

/** Short form of the FAO-56 Table 11 region the stage lengths come from, read from the catalog citation text. */
export function faoRegion(crop: Crop): string | null {
  const page = crop.stageDays?.ini?.page ?? "";
  const m = page.match(/region(?: cell)? '([^']+)'/);
  return m ? m[1] : null;
}

export const ALTERNATIVES_NOTE =
  "Each crop modelled alone every season with your water supply over the real 1986 to 2025 record. The warmer and drier columns are what-ifs applied to that record, not forecasts. This compares water need only, not yield, price, pests or markets. Ask a local adviser before switching.";

const FIRST_DECADE = DECADES[0];
const LAST_DECADE = DECADES[DECADES.length - 1];

export type ShortCount = { short: number; evaluated: number };

export type AlternativeRow = {
  id: string;
  name: string;
  current: boolean;
  group: SeasonGroupId;
  /** e.g. "December", from the catalog default planting date. */
  plantingMonth: string;
  /** FAO-56 Table 11 region row of the stage lengths, e.g. "Calif. Desert, USA". Null when the citation does not name one. */
  faoRegion: string | null;
  /** False when too few seasons could be judged; such rows are listed after the ranked ones with the reason. */
  ranked: boolean;
  missingDataNote: string | null;
  seasonsEvaluated: number;
  shortAll: ShortCount;
  shortFirstDecade: ShortCount;
  shortLastDecade: ShortCount;
  warmerLastDecade: ShortCount | null;
  drierLastDecade: ShortCount | null;
  medianNeedMm: number | null;
  heatThresholdKnown: boolean;
  /** Median hot days per season (real record), only when the heat threshold is known and counted. Never used for ranking. */
  medianHeatDays: number | null;
  line: string;
};

export type AlternativesOk = {
  status: "ok";
  supplyMm: number;
  /** All rows, in group order (the farmer's current group first), ranked within each group. */
  rows: AlternativeRow[];
  groups: { id: SeasonGroupId; label: string; headline: string; rows: AlternativeRow[] }[];
  headline: string;
  note: string;
  plantingNote: string;
  dataLabel: string;
  skipped: { id: string; reason: string }[];
};
export type AlternativesResult = AlternativesOk | { status: "unavailable"; reason: string; nextStep: string };

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function countShort(needs: SeasonNeed[], supplyMm: number, from: number, to: number): ShortCount {
  let short = 0;
  let evaluated = 0;
  for (const n of needs) {
    if (n.year < from || n.year > to) continue;
    const r = judgeSeason(n, supplyMm);
    if (r.outcome === null) continue;
    evaluated += 1;
    if (r.outcome === "short") short += 1;
  }
  return { short, evaluated };
}

const of = (c: ShortCount) => `${c.short} of ${c.evaluated}`;

export function cropLine(
  row: Pick<AlternativeRow, "shortLastDecade" | "warmerLastDecade" | "drierLastDecade" | "ranked" | "missingDataNote" | "medianNeedMm" | "plantingMonth">,
): string {
  if (!row.ranked) return row.missingDataNote ?? "Too much missing data to judge.";
  const rain =
    row.medianNeedMm !== null && row.medianNeedMm < RAIN_COVERED_MM
      ? `In most seasons rain covered this crop's modelled water need when planted in ${row.plantingMonth}. `
      : "";
  const parts = [`Short of water in ${row.shortLastDecade.short} of the last ${row.shortLastDecade.evaluated} seasons (2016 to 2025)`];
  if (row.warmerLastDecade) parts.push(`${of(row.warmerLastDecade)} if it were 2 °C warmer`);
  if (row.drierLastDecade) parts.push(`${of(row.drierLastDecade)} with 20 percent less rain`);
  return `${rain}${parts.join("; ")}.`;
}

function compare(a: AlternativeRow, b: AlternativeRow): number {
  if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
  const d1 = a.shortLastDecade.short - b.shortLastDecade.short;
  if (d1) return d1;
  const d2 = (a.warmerLastDecade?.short ?? Infinity) - (b.warmerLastDecade?.short ?? Infinity);
  if (d2 && Number.isFinite(d2)) return d2;
  const d3 = (a.medianNeedMm ?? Infinity) - (b.medianNeedMm ?? Infinity);
  if (d3 && Number.isFinite(d3)) return d3;
  return a.name.localeCompare(b.name);
}

export function headlineFor(rows: AlternativeRow[], groupLabel = "crops"): string {
  const ranked = rows.filter((r) => r.ranked);
  if (ranked.length === 0) return `No ${groupLabel} could be judged here: too much of the weather record is missing.`;
  const top = ranked[0];
  const best = top.shortLastDecade.short;
  const current = ranked.filter((r) => r.current);
  if (current.length === 0) {
    return `Among ${groupLabel}, ${top.name} (planted in ${top.plantingMonth}, from its FAO table row) fits your water most often: short in ${top.shortLastDecade.short} of the last ${top.shortLastDecade.evaluated} seasons.`;
  }
  const bestCurrent = Math.min(...current.map((r) => r.shortLastDecade.short));
  if (bestCurrent <= best) {
    return `Among ${groupLabel}, none fits your water better than what you grow now over the last 10 seasons (fewest short seasons: ${best}).`;
  }
  const better = ranked.filter((r) => !r.current && r.shortLastDecade.short < bestCurrent).length;
  return `Among ${groupLabel}, ${better} crop${better === 1 ? "" : "s"} would have been short of water less often than your current crops over the last 10 seasons. ${top.name} (planted in ${top.plantingMonth}, from its FAO table row) was short in ${of(top.shortLastDecade)}; your best current crop in ${bestCurrent}.`;
}

export function rankAlternatives(power: PowerResult, supplyMm: number, crops: Crop[], currentIds: string[] = []): AlternativesResult {
  const real = buildSeasonTable(power, crops);
  if (real.status !== "ok") return { status: "unavailable", reason: real.reason, nextStep: real.nextStep };
  const warm = buildSeasonTable(scenarioPower(power, WARMER), crops);
  const dry = buildSeasonTable(scenarioPower(power, DRIER), crops);
  const warmNeeds = warm.status === "ok" ? warm.table.needs : {};
  const dryNeeds = dry.status === "ok" ? dry.table.needs : {};
  const current = new Set(currentIds);

  const rows: AlternativeRow[] = [];
  const skippedExtra: { id: string; reason: string }[] = [];
  for (const crop of crops) {
    const needs = real.table.needs[crop.id];
    if (!needs) continue;
    const shortAll = countShort(needs, supplyMm, FIRST_SEASON, LAST_SEASON);
    const shortLastDecade = countShort(needs, supplyMm, LAST_DECADE.startYear, LAST_DECADE.endYear);
    const w = warmNeeds[crop.id];
    const d = dryNeeds[crop.id];
    const warmerLastDecade = w ? countShort(w, supplyMm, LAST_DECADE.startYear, LAST_DECADE.endYear) : null;
    const drierLastDecade = d ? countShort(d, supplyMm, LAST_DECADE.startYear, LAST_DECADE.endYear) : null;
    const judged = needs.filter((n) => n.needMm !== null);
    const ranked =
      shortLastDecade.evaluated >= MIN_LAST_DECADE_SEASONS &&
      (warmerLastDecade?.evaluated ?? 0) >= MIN_LAST_DECADE_SEASONS &&
      (drierLastDecade?.evaluated ?? 0) >= MIN_LAST_DECADE_SEASONS;
    const missingDataNote = ranked
      ? null
      : `Too much missing data: only ${shortLastDecade.evaluated} of the last 10 seasons could be judged, so this crop is not ranked.`;
    const threshold = (needs[0] as { heatThresholdC: number | null }).heatThresholdC;
    const heatThresholdKnown = typeof threshold === "number" && Number.isFinite(threshold);
    const heat = judged.map((n) => n.heatDays as number | null).filter((h): h is number => typeof h === "number");
    const medNeed = median(judged.map((n) => n.needMm as number));
    const medHeat = heatThresholdKnown ? median(heat) : null;
    const mi = plantingMonthIndex(crop);
    if (mi === null) {
      skippedExtra.push({ id: crop.id, reason: "No default planting date, so its growing season is unknown." });
      continue;
    }
    const row: AlternativeRow = {
      id: crop.id,
      name: crop.name,
      current: current.has(crop.id),
      group: seasonGroupOf(mi),
      plantingMonth: MONTHS[mi],
      faoRegion: faoRegion(crop),
      ranked,
      missingDataNote,
      seasonsEvaluated: shortAll.evaluated,
      shortAll,
      shortFirstDecade: countShort(needs, supplyMm, FIRST_DECADE.startYear, FIRST_DECADE.endYear),
      shortLastDecade,
      warmerLastDecade,
      drierLastDecade,
      medianNeedMm: medNeed === null ? null : Math.round(medNeed),
      heatThresholdKnown,
      medianHeatDays: medHeat === null ? null : Math.round(medHeat),
      line: "",
    };
    row.line = cropLine(row);
    rows.push(row);
  }
  rows.sort(compare);
  const order: SeasonGroupId[] = rows.some((r) => r.current && r.group === "warm") && !rows.some((r) => r.current && r.group === "cool") ? ["warm", "cool"] : ["cool", "warm"];
  // Current crops' group first; when the farmer grows in both, cool then warm (calendar order of the default planting dates).
  const groups = order
    .map((id) => {
      const gr = rows.filter((r) => r.group === id);
      const label = id === "cool" ? "crops planted September to February" : "crops planted March to August";
      return { id, label: SEASON_GROUPS[id], headline: headlineFor(gr, label), rows: gr };
    })
    .filter((g) => g.rows.length > 0);
  return {
    status: "ok",
    supplyMm,
    rows: groups.flatMap((g) => g.rows),
    groups,
    headline: groups.map((g) => g.headline).join(" "),
    note: ALTERNATIVES_NOTE,
    plantingNote: PLANTING_NOTE,
    dataLabel: real.table.dataLabel,
    skipped: [...real.skipped, ...skippedExtra],
  };
}
