/**
 * All wording is generated from computed numbers. Display rule (same as Stage 2): any difference written in a
 * sentence equals the difference of the rounded numbers shown beside it, and no "+" or "-" ever precedes a digit
 * (differences are written as "more", "fewer", "short by", "to spare"). Years use an en dash.
 * No causal language: the sentences describe what the record shows.
 */
import type { DecadeCount, SeasonResult } from "./types";

export function roundInt(x: number): number {
  const r = Math.round(Math.abs(x)) * Math.sign(x);
  return r === 0 ? 0 : r;
}

function n(x: number): string {
  return Math.abs(roundInt(x)).toLocaleString("en-US");
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count.toLocaleString("en-US")} ${many}`;
}

export const SMALL_SAMPLE_CAVEAT =
  "Ten seasons in each decade is a small sample. These are counts of what the record shows, not a trend or a forecast.";

/** "2 of 10 seasons" or "2 of the 9 seasons that could be judged" */
function countPhrase(d: DecadeCount): string {
  if (d.evaluable === d.seasons) return `${d.short} of ${d.evaluable} seasons`;
  return `${d.short} of the ${plural(d.evaluable, "season", "seasons")} that could be judged`;
}

/** Headline comparing the first and last decade. Shape: "Short on water in 2 of 10 seasons in 1986–1995, and 6 of 10 in 2016–2025". */
export function rotationHeadline(first: DecadeCount, last: DecadeCount): string {
  if (first.evaluable === 0 && last.evaluable === 0) {
    return `Not enough data: no season in ${first.label} or ${last.label} could be judged`;
  }
  if (first.evaluable === 0) return `Not enough data: no season in ${first.label} could be judged`;
  if (last.evaluable === 0) return `Not enough data: no season in ${last.label} could be judged`;
  const second =
    last.evaluable === last.seasons
      ? `${last.short} of ${last.evaluable}`
      : `${last.short} of the ${plural(last.evaluable, "season", "seasons")} that could be judged`;
  return `Short on water in ${countPhrase(first)} in ${first.label}, and ${second} in ${last.label}`;
}

function greyNote(d: DecadeCount): string | null {
  if (d.insufficient === 0) return null;
  return `In ${d.label}, ${d.insufficient} of ${d.seasons} seasons could not be judged because of missing weather data.`;
}

/** Plain sentence: more, fewer or the same. */
export function rotationSentence(first: DecadeCount, last: DecadeCount): string {
  const notes = [greyNote(first), greyNote(last)].filter((s): s is string => s !== null);
  const tail = notes.length ? " " + notes.join(" ") : "";

  if (first.evaluable === 0 || last.evaluable === 0) {
    const e = (d: DecadeCount) => `${d.evaluable} of ${d.seasons} seasons in ${d.label}`;
    return `The two decades cannot be compared: ${e(first)} and ${e(last)} could be judged.${tail}`;
  }

  let body: string;
  const a = first.short;
  const b = last.short;
  if (first.evaluable === last.evaluable) {
    const judged = first.evaluable === first.seasons ? "" : " that could be judged";
    if (a === 0 && b === 0) {
      body =
        first.evaluable === first.seasons
          ? `The supply was never short in either decade, so there is no change.`
          : `None of the seasons${judged} was short in either decade, so there is no change.`;
    } else if (a === b) {
      body = `That is the same number of short seasons in both decades (${a}), so there is no change in the count.`;
    } else if (b > a) {
      body = `That is ${plural(b - a, "more short season", "more short seasons")} in ${last.label} than in ${first.label}.`;
    } else {
      body = `That is ${plural(a - b, "fewer short season", "fewer short seasons")} in ${last.label} than in ${first.label}.`;
    }
  } else {
    // Different numbers of judged seasons: counts are not comparable one to one, so compare shares of judged seasons.
    const lhs = b * first.evaluable;
    const rhs = a * last.evaluable;
    const intro = `A different number of seasons could be judged in each decade (${first.evaluable} and ${last.evaluable}), so the two are compared as shares of the judged seasons: `;
    if (lhs === rhs) {
      body =
        a === 0
          ? `${intro}no judged season was short in either decade, so there is no change.`
          : `${intro}the share short is the same in both decades, so there is no change.`;
    } else if (lhs > rhs) {
      body = `${intro}a larger share was short in ${last.label} than in ${first.label}.`;
    } else {
      body = `${intro}a smaller share was short in ${last.label} than in ${first.label}.`;
    }
  }
  return body + tail;
}

/** One-sentence description of a season for the scrubber caption. Differences are differences of the rounded numbers shown. */
export function describeSeason(r: SeasonResult): string {
  if (r.outcome === null || r.needMm === null) {
    return `${r.year}: could not be judged. ${r.reason ?? "Not enough data."}`;
  }
  const need = roundInt(r.needMm);
  const supply = roundInt(r.supplyMm);
  if (need === 0 && r.needMm === 0) {
    return `${r.year}: ${r.cropName} needed no irrigation water; rain covered its demand. The supply of ${n(r.supplyMm)} mm was not needed.`;
  }
  if (r.outcome === "short") {
    const gap = need - supply;
    const how = gap > 0 ? `short by ${n(gap)} mm` : `just short (by less than 1 mm)`;
    return `${r.year}: ${r.cropName} needed about ${n(r.needMm)} mm of irrigation water. A supply of ${n(r.supplyMm)} mm was ${how}.`;
  }
  const spare = supply - need;
  const how = spare > 0 ? `covered it with ${n(spare)} mm to spare` : `just covered it`;
  return `${r.year}: ${r.cropName} needed about ${n(r.needMm)} mm of irrigation water. A supply of ${n(r.supplyMm)} mm ${how}.`;
}
