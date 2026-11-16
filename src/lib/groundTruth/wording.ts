/**
 * Plain-English wording generated ONLY from computed numbers. No hard-coded results: change the data and the sentences change.
 * Every number goes through num()/pct(), which throw on NaN or Infinity so a bad value can never reach a screen.
 */
import { formatUtc } from "../power/label";
import { groundOriginLine } from "./label";
import type { CdlHistory, GaugeProductStats, GroundTruthOk, PairStats, WellFact } from "./types";

function finite(n: number): number {
  if (!Number.isFinite(n)) throw new Error(`Refusing to put a non-finite number (${n}) into wording.`);
  return n;
}
const num = (n: number, d = 1) => finite(n).toFixed(d);
const abs = (n: number, d = 1) => Math.abs(finite(n)).toFixed(d);
const r2 = (n: number | null) => (n === null ? "not defined (no variation)" : finite(n).toFixed(2));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dateLong = (iso: string) => formatUtc(`${iso}T00:00:00Z`).replace(/, 00:00 UTC$/, "");

// ---------------- Daymet vs POWER and the gauge ----------------

function tempLine(label: string, s: PairStats): string {
  const how = Math.abs(s.bias) < 0.05 ? `matched Daymet on average` : `averaged ${abs(s.bias)} C ${s.bias > 0 ? "warmer" : "cooler"} than Daymet`;
  return `${label}: POWER ${how} (R-squared ${r2(s.r2)}, typical day-to-day gap ${num(s.rmse)} C).`;
}

export type GroundCheckWording = { labels: string[]; daymet: string[]; gauge: string[]; caveats: string[] };

function productLine(name: string, s: GaugeProductStats): string {
  const hit = s.wetDays.both;
  const gaugeWet = s.wetDays.both + s.wetDays.gaugeOnly;
  const bias = Math.abs(s.biasMmPerDay) < 0.005 ? "matched the gauge on average" : `averaged ${abs(s.biasMmPerDay, 2)} mm per day ${s.biasMmPerDay > 0 ? "more" : "less"} than the gauge`;
  const ratio = s.ratio === null ? "" : ` (${num(s.ratio, 2)} times the gauge total)`;
  return `${name} totalled ${num(s.productTotalMm)} mm on those days${ratio} and ${bias}; R-squared ${r2(s.r2)}. Of ${plural(gaugeWet, "day")} the gauge recorded ${s.wetDays.threshold} mm or more, ${name} also reached that on ${hit}; it reached it on ${s.wetDays.productOnly} days the gauge did not.`;
}

export function groundCheckWording(g: GroundTruthOk): GroundCheckWording {
  const labels: string[] = [];
  const out: GroundCheckWording = { labels, daymet: [], gauge: [], caveats: [] };

  const dl = g.daymet;
  labels.push(`${dl.source.name}: ${groundOriginLine({ origin: g.origin, fetchedAt: dl.fetchedAt }, "Daymet")}`);
  if (dl.status !== "ok" || !dl.data) {
    out.daymet.push(dl.message);
  } else {
    const d = dl.data;
    const a = d.precipAnnual;
    const rain = Math.abs(a.biasMmPerYear) < 1 ? "about the same as" : `${abs(a.biasMmPerYear, 0)} mm per year ${a.biasMmPerYear > 0 ? "higher than" : "lower than"}`;
    out.daymet.push(
      `NASA POWER (regional reanalysis, about 50 km grid) and Daymet (1 km grid interpolated from ground weather stations) were compared on ${d.pairedDays.toLocaleString("en-US")} shared days, ${d.period.start.slice(0, 4)} to ${d.period.end.slice(0, 4)}. This compares two gridded products with each other. It does not say either one is right.`,
    );
    out.daymet.push(
      `Rain: a typical year had ${num(a.meanPowerMm, 0)} mm in POWER and ${num(a.meanDaymetMm, 0)} mm in Daymet, so POWER ran ${rain} Daymet${a.ratioOfTotals === null ? "" : ` (ratio ${num(a.ratioOfTotals, 2)})`}. Year-to-year totals agree with R-squared ${r2(a.r2)} over ${plural(a.rows.length, "year")}; day by day R-squared is ${r2(d.precipDaily.r2)}.`,
    );
    out.daymet.push(tempLine("Daily high", d.tMax));
    out.daymet.push(tempLine("Daily low", d.tMin));
    if (d.droppedLeapDec31 > 0) out.caveats.push(`Daymet uses a 365-day calendar and drops 31 December in leap years, so ${plural(d.droppedLeapDec31, "day")} (31 December of each leap year) were left out of both products.`);
    if (a.excludedYears.length) out.caveats.push(`Years with fewer than 360 shared days were left out of the yearly rain totals: ${a.excludedYears.map((y) => `${y.year} (${y.pairedDays} days)`).join(", ")}.`);
  }

  const gl = g.gauge;
  labels.push(`${gl.source.name}: ${gl.status === "ok" || gl.status === "error" ? groundOriginLine({ origin: g.origin, fetchedAt: gl.fetchedAt }, "CoCoRaHS") : "not fetched"}`);
  if (gl.status !== "ok" || !gl.data) {
    out.gauge.push(gl.message);
  } else {
    const d = gl.data;
    out.gauge.push(
      `One volunteer rain gauge, ${d.station.name} (${d.station.id}), ${num(d.station.distanceKm)} km from this point, sent a readable daily report on ${d.reportedDays} days between ${dateLong(d.window.start)} and ${dateLong(d.window.end)} (${d.daysWithoutReport.toLocaleString("en-US")} ${d.daysWithoutReport === 1 ? "day" : "days"} in the window had no report${d.reportsReturned > d.reportedDays ? `, and ${plural(d.reportsReturned - d.reportedDays, "report")} had no readable amount` : ""}). Only days it reported are compared; a missing day is not treated as dry.`,
    );
    out.gauge.push(`On those days the gauge recorded ${num(d.power.gaugeTotalMm)} mm in total (rain of 1 mm or more on ${d.gaugeRainyDays} days).`);
    out.gauge.push(productLine("NASA POWER", d.power));
    out.gauge.push(productLine("Daymet", d.daymet));
    out.caveats.push("A single gauge is indicative only: it is one point, kilometres from the grid cells, and daily totals are matched by date label even though the gauge, Daymet and POWER define a rain day differently.");
  }
  return out;
}

// ---------------- Crop history, land cover, wells ----------------

export type CropHistoryWording = { labels: string[]; cdl: string[]; nlcd: string; wells: string[]; caveats: string[] };

const NON_CROP = /^(developed|open water|perennial)/i;

function runs(years: CdlHistory["years"]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < years.length) {
    const y = years[i]!;
    const name = y.majority?.category ?? "no answer";
    let j = i;
    while (j + 1 < years.length && (years[j + 1]!.majority?.category ?? "no answer") === name && years[j + 1]!.year === years[j]!.year + 1) j++;
    out.push(i === j ? `${y.year} ${name}` : `${y.year}-${years[j]!.year} ${name}`);
    i = j + 1;
  }
  return out;
}

function wellLine(prefix: string, w: WellFact, fetchedAt: string, sinceNote: string): string {
  const label = w.name && w.name !== w.id ? `${w.name} (${w.id}),` : `${w.id},`;
  const latest = w.readings[0];
  if (!latest) return `${prefix} ${label} ${num(w.distanceKm)} km away, has no readable depth-to-water readings.`;
  const ageYears = Math.floor((Date.parse(fetchedAt) - Date.parse(latest.date)) / (365.25 * 86_400_000));
  const oldNote = ageYears >= 5 ? ` That reading is ${ageYears} years older than this response, so it says little about today.` : "";
  const list = w.readings.map((r) => `${num(r.value, 2)} ${r.unit} on ${dateLong(r.date)}`).join("; ");
  const sparse = w.readingsReturned < 3 ? ` Only ${plural(w.readingsReturned, "reading")} found, so this is sparse.` : "";
  return `${prefix} ${label} ${num(w.distanceKm)} km away. Newest readings of depth to water (USGS parameter 72019): ${list}.${oldNote}${sparse}${sinceNote}`;
}

export function cropHistoryWording(g: GroundTruthOk): CropHistoryWording {
  const labels: string[] = [];
  const out: CropHistoryWording = { labels, cdl: [], nlcd: "", wells: [], caveats: [] };

  const c = g.cdl;
  labels.push(`${c.source.name}: ${c.status === "ok" || c.status === "error" ? groundOriginLine({ origin: g.origin, fetchedAt: c.fetchedAt }, "USDA NASS") : "not fetched"}`);
  if (c.status !== "ok" || !c.data) {
    out.cdl.push(c.message);
  } else {
    const ys = c.data.years.filter((y) => y.majority);
    const first = ys[0]!.year;
    const last = ys[ys.length - 1]!.year;
    const names = new Set(ys.map((y) => y.majority!.category));
    const per = c.data.pixelsPerYear;
    const developedAll = [...names].every((n) => /^Developed/i.test(n));
    if (developedAll) {
      const kinds = [...names].map((n) => n.replace(/^Developed\/?/i, "").trim() || "Developed");
      out.cdl.push(
        `In all ${ys.length} years from ${first} to ${last} the satellite classification puts this spot in a Developed (built-up) class${names.size > 1 ? `, with the intensity varying between years (${kinds.join(", ")})` : ""}. It is not classed as a crop in any year, so there is no crop history to show for this point.`,
      );
    } else if (names.size === 1) {
      const n = [...names][0]!;
      out.cdl.push(
        `The satellite classification calls this spot "${n}" in all ${ys.length} years from ${first} to ${last}${NON_CROP.test(n) ? ", which is not a crop class, so there is no crop history to show for this point" : ""}.`,
      );
    } else {
      out.cdl.push(`What the satellite classification says this spot was, most common class of the ${per} nearest 30 m pixels, ${first} to ${last}: ${runs(ys).join("; ")}.`);
    }
    const full = ys.filter((y) => y.agree === y.sampled).length;
    const low = Math.min(...ys.map((y) => y.agree));
    const lowAll = ys.filter((y) => y.agree === low).map((y) => y.year);
    const lowYears = lowAll.length > 3 ? [...lowAll.slice(0, 3).map(String), `and ${lowAll.length - 3} more`] : lowAll.map(String);
    out.cdl.push(
      `All ${per} pixels agreed in ${full} of ${ys.length} years; the weakest year${lowAll.length > 1 ? "s were" : " was"} ${lowYears.join(", ")} with ${low} of ${per} pixels agreeing.${ys.some((y) => y.tie) ? ` In ${plural(ys.filter((y) => y.tie).length, "year")} two classes tied.` : ""}`,
    );
    const differs = ys.filter((y) => y.centre && y.centre.value !== y.majority!.value);
    if (differs.length) {
      const shown = differs.slice(0, 6).map((y) => `${y.year} ${y.centre!.category}`).join(", ");
      out.cdl.push(`The single pixel at the exact point alone gave a different class from the block's most common one in ${differs.length} of ${ys.length} years (${shown}${differs.length > 6 ? ", and more" : ""}), which is why the block vote is used.`);
    }
    if (c.data.failedRequests) out.cdl.push(`${plural(c.data.failedRequests, "pixel request")} failed and ${c.data.failedRequests === 1 ? "is" : "are"} left out.`);
    out.caveats.push("This is what a satellite classification says the land was. Results for a single field or pixel are noisy (NASA/USDA accuracy figures describe broad crop categories). It is not the farmer's record.");
  }

  const n = g.nlcd;
  labels.push(`${n.source.name}: ${n.status === "ok" || n.status === "error" ? groundOriginLine({ origin: g.origin, fetchedAt: n.fetchedAt }, "MRLC") : "not fetched"}`);
  out.nlcd = n.status === "ok" && n.data ? `NLCD ${n.data.year} land cover at this spot: ${n.data.name} (class ${n.data.code}).` : n.message;

  const w = g.wells;
  labels.push(`${w.source.name}: ${w.status === "ok" || w.status === "error" ? groundOriginLine({ origin: g.origin, fetchedAt: w.fetchedAt }, "USGS") : "not fetched"}`);
  if (w.status !== "ok" || !w.data) {
    out.wells.push(w.message);
  } else {
    const d = w.data;
    if (d.nearest) out.wells.push(wellLine("Nearest USGS well with depth-to-water readings:", d.nearest, w.fetchedAt, ""));
    else out.wells.push(`None of the nearest wells has depth-to-water readings.`);
    if (d.nearestRecent) out.wells.push(wellLine(`Nearest well with a reading since ${d.recentSince.slice(0, 4)}:`, d.nearestRecent, w.fetchedAt, ""));
    else if (d.nearest && Date.parse(d.nearest.readings[0]?.date ?? "") >= Date.parse(d.recentSince)) out.wells.push(`That well has readings since ${d.recentSince.slice(0, 4)}.`);
    else out.wells.push(`No well within about ${d.searchRadiusKm} km has a depth-to-water reading since ${d.recentSince.slice(0, 4)}.`);
    out.caveats.push("A nearby well's depth to water is a fact about that well, not about this field's water table.");
  }
  return out;
}
