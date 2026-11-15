import { describe, expect, it } from "vitest";
import { loadSavedDemoPin } from "../power";
import type { DailyRecord, PowerResult } from "../types";
import { computeShift, MAX_MISSING_DAYS_PER_YEAR, roundInt } from "./compute";
import type { MetricId, MetricShift, ShiftResult } from "./types";

// ---- test fixtures only (the app never uses these) ----
function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function iso(y: number, doy: number) {
  const d = new Date(Date.UTC(y, 0, doy));
  return d.toISOString().slice(0, 10);
}
type Gen = (year: number, doy: number) => Partial<DailyRecord>;
const FULL: Omit<DailyRecord, "date"> = { tMaxC: 25, tMinC: 12, rhPct: 50, wind2mMs: 2, solarMJm2: 18, precipMm: 1 };

function makePower(
  y0: number,
  y1: number,
  gen: Gen = () => ({}),
  over: Partial<PowerResult> = {},
): PowerResult {
  const days: DailyRecord[] = [];
  for (let y = y0; y <= y1; y++) {
    const n = isLeap(y) ? 366 : 365;
    for (let d = 1; d <= n; d++) days.push({ date: iso(y, d), ...FULL, ...gen(y, d) });
  }
  return {
    status: "ok",
    lat: 36.7,
    lon: -119.8,
    gridCell: { key: "k", latCenter: 36.5, lonCenter: -120 },
    elevationM: 100,
    units: {} as PowerResult["units"],
    requested: { start: `${y0}-01-01`, end: `${y1}-12-31` },
    coverage: { start: `${y0}-01-01`, end: `${y1}-12-31` },
    missing: { tMaxC: 0, tMinC: 0, rhPct: 0, wind2mMs: 0, solarMJm2: 0, precipMm: 0, anyField: 0, totalDays: days.length },
    fetchedAt: "2026-01-01T00:00:00Z",
    sourceUrls: [],
    origin: "saved",
    days,
    ...over,
  };
}
function ok(r: ShiftResult) {
  if (r.status !== "ok") throw new Error("expected ok: " + r.reason);
  return r;
}
const hotAbove = (n: (y: number) => number): Gen => (y, d) => ({ tMaxC: d <= n(y) ? 40 : 25 });

describe("periods", () => {
  it("splits 1985-2004 early, 2006-2025 late, 2005 neither, outside years none", () => {
    const r = ok(computeShift(makePower(1984, 2026)));
    const byYear = new Map(r.metrics.hotDays.years.map((y) => [y.year, y.period]));
    expect(byYear.get(1984)).toBe("none");
    expect(byYear.get(1985)).toBe("early");
    expect(byYear.get(2004)).toBe("early");
    expect(byYear.get(2005)).toBe("none");
    expect(byYear.get(2006)).toBe("late");
    expect(byYear.get(2025)).toBe("late");
    expect(byYear.get(2026)).toBe("none");
    expect(r.periods).toEqual({ early: [1985, 2004], late: [2006, 2025] });
    expect(r.metrics.hotDays.early.yearsUsed).toBe(20);
    expect(r.metrics.hotDays.late.yearsUsed).toBe(20);
  });
});

describe("hot-day threshold", () => {
  it("is strictly greater than 35", () => {
    const g: Gen = (_y, d) => ({ tMaxC: d === 1 ? 35.0 : d === 2 ? 35.01 : d === 3 ? 34.99 : 20 });
    const r = ok(computeShift(makePower(1985, 2025, g)));
    expect(r.metrics.hotDays.years[0].value).toBe(1);
  });
  it("needs only tMaxC (other fields null still counts)", () => {
    const g: Gen = () => ({ tMaxC: 40, tMinC: null, rhPct: null, wind2mMs: null, solarMJm2: null, precipMm: null });
    const r = ok(computeShift(makePower(1985, 2025, g)));
    expect(r.metrics.hotDays.years[0].value).toBe(365);
    expect(r.metrics.hotDays.years[0].missingDays).toBe(0);
    expect(r.metrics.et0.verdict).toBe("insufficient-data");
    expect(r.metrics.precip.verdict).toBe("insufficient-data");
  });
});

describe("totals", () => {
  it("sums precip over leap and non-leap years", () => {
    const r = ok(computeShift(makePower(1985, 2025)));
    const y = (n: number) => r.metrics.precip.years.find((v) => v.year === n)!.value;
    expect(y(2000)).toBe(366);
    expect(y(2001)).toBe(365);
    expect(y(2100 - 100)).toBe(366);
  });
  it("ET0 is positive and finite", () => {
    const r = ok(computeShift(makePower(1985, 2025)));
    for (const y of r.metrics.et0.years) {
      expect(Number.isFinite(y.value)).toBe(true);
      expect(y.value!).toBeGreaterThan(0);
    }
  });
});

describe("missing data", () => {
  const withMissing = (k: number): Gen => (y, d) => (y === 1990 && d <= k ? { precipMm: null } : {});
  it("10 missing days: used as-is, missingDays 10, not filled", () => {
    const r = ok(computeShift(makePower(1985, 2025, withMissing(MAX_MISSING_DAYS_PER_YEAR))));
    const y = r.metrics.precip.years.find((v) => v.year === 1990)!;
    expect(y.flagged).toBe(false);
    expect(y.missingDays).toBe(10);
    expect(y.value).toBe(365 - 10);
    expect(r.metrics.precip.early.yearsUsed).toBe(20);
  });
  it("11 missing days: flagged, null, excluded", () => {
    const r = ok(computeShift(makePower(1985, 2025, withMissing(11))));
    const y = r.metrics.precip.years.find((v) => v.year === 1990)!;
    expect(y.flagged).toBe(true);
    expect(y.value).toBeNull();
    expect(y.missingDays).toBe(11);
    expect(r.metrics.precip.early.yearsUsed).toBe(19);
    expect(r.metrics.precip.early.flaggedYears).toEqual([1990]);
    // other metrics unaffected
    expect(r.metrics.hotDays.early.yearsUsed).toBe(20);
  });
  it("a missing ET0 input on a day counts as a missing ET0 day", () => {
    const g: Gen = (y, d) => (y === 1990 && d <= 3 ? { solarMJm2: null } : {});
    const r = ok(computeShift(makePower(1985, 2025, g)));
    expect(r.metrics.et0.years.find((v) => v.year === 1990)!.missingDays).toBe(3);
    expect(r.metrics.precip.years.find((v) => v.year === 1990)!.missingDays).toBe(0);
  });
  it("partial calendar year is flagged", () => {
    const p = makePower(1985, 2025);
    p.days = p.days.filter((d) => !(d.date >= "1990-06-01" && d.date <= "1990-06-03"));
    const r = ok(computeShift(p));
    const y = r.metrics.hotDays.years.find((v) => v.year === 1990)!;
    expect(y.flagged).toBe(true);
    expect(y.value).toBeNull();
    expect(y.missingDays).toBe(3);
  });
  it("record starting mid-year flags that first year", () => {
    const p = makePower(1985, 2025);
    p.days = p.days.slice(10);
    const r = ok(computeShift(p));
    expect(r.metrics.hotDays.years[0].flagged).toBe(true);
    expect(r.metrics.hotDays.early.yearsUsed).toBe(19);
  });
  it("fewer than 15 usable years in a period -> insufficient-data with null means", () => {
    const g: Gen = (y, d) => (y >= 1990 && y <= 1995 && d <= 11 ? { precipMm: null } : {}); // 6 flagged -> 14 usable
    const r = ok(computeShift(makePower(1985, 2025, g)));
    const m = r.metrics.precip;
    expect(m.early.yearsUsed).toBe(14);
    expect(m.early.mean).toBeNull();
    expect(m.verdict).toBe("insufficient-data");
    expect(m.diff).toBeNull();
    expect(m.detail).toMatch(/not enough complete data/i);
    expect(m.headline).toBe("Not enough data");
    // exactly 15 usable is enough
    const g2: Gen = (y, d) => (y >= 1990 && y <= 1994 && d <= 11 ? { precipMm: null } : {});
    expect(ok(computeShift(makePower(1985, 2025, g2))).metrics.precip.early.mean).not.toBeNull();
  });
});

describe("unavailable / elevation", () => {
  it("null elevation: ET0 insufficient with reason, others fine", () => {
    const r = ok(computeShift(makePower(1985, 2025, () => ({}), { elevationM: null })));
    expect(r.metrics.et0.verdict).toBe("insufficient-data");
    expect(r.metrics.et0.detail).toMatch(/elevation/i);
    expect(r.metrics.et0.early.mean).toBeNull();
    expect(r.metrics.hotDays.early.mean).not.toBeNull();
    expect(r.metrics.precip.early.mean).not.toBeNull();
  });
  it("error and no-coverage and empty -> unavailable", () => {
    for (const status of ["error", "no-coverage"] as const) {
      const r = computeShift(makePower(1985, 1986, () => ({}), { status, message: "boom" }));
      expect(r.status).toBe("unavailable");
      if (r.status === "unavailable") {
        expect(r.reason).toBe("boom");
        expect(r.nextStep.length).toBeGreaterThan(5);
      }
    }
    const e = computeShift({ ...makePower(1985, 1986), days: [] });
    expect(e.status).toBe("unavailable");
  });
  it("partial status still computes", () => {
    expect(computeShift(makePower(1985, 2025, () => ({}), { status: "partial" })).status).toBe("ok");
  });
});

describe("verdict rule", () => {
  // hot days per year = base(y) via the first n days
  const run = (n: (y: number) => number) => ok(computeShift(makePower(1985, 2025, hotAbove(n)))).metrics.hotDays;
  const wiggle = (y: number) => ((y * 7) % 5) - 2; // deterministic -2..2

  it("clear increase", () => {
    const m = run((y) => (y <= 2004 ? 20 : 40) + wiggle(y));
    expect(m.verdict).toBe("increase");
    expect(m.diff!).toBeGreaterThan(15);
    expect(Math.abs(m.diff!)).toBeGreaterThan(2 * m.standardError!);
  });
  it("clear decrease", () => {
    const m = run((y) => (y <= 2004 ? 60 : 30) + wiggle(y));
    expect(m.verdict).toBe("decrease");
    expect(m.diff!).toBeLessThan(0);
  });
  it("noisy series with a small gap is no clear change", () => {
    const noise = (y: number) => ((y * 13) % 41) - 20; // large swing
    const m = run((y) => 50 + noise(y) + (y > 2005 ? 2 : 0));
    expect(m.verdict).toBe("no-clear-change");
    expect(m.headline).toBe("No clear change");
  });
  it("zero variance: identical years, different periods -> clear; identical periods -> no change", () => {
    const a = run((y) => (y <= 2004 ? 10 : 12));
    expect(a.standardError).toBe(0);
    expect(a.verdict).toBe("increase");
    expect(a.diff).toBe(2);
    const b = run(() => 10);
    expect(b.standardError).toBe(0);
    expect(b.diff).toBe(0);
    expect(b.verdict).toBe("no-clear-change");
  });
  it("early mean 0 -> pctChange null, still verdict", () => {
    const m = run((y) => (y <= 2004 ? 0 : 5));
    expect(m.pctChange).toBeNull();
    expect(m.verdict).toBe("increase");
    expect(m.headline).toBe("5 more days a year");
  });
  it("a gap that rounds to zero is never a clear change", () => {
    // one extra hot day in a single late year: diff = 0.05 days with se > 0 or tiny
    const m = run((y) => (y === 2010 ? 1 : 0));
    expect(Math.abs(m.diff!)).toBeLessThan(0.5);
    expect(m.verdict).toBe("no-clear-change");
    expect(m.headline).not.toMatch(/[+-]0\b/);
    expect(m.detail).toMatch(/essentially the same/);
  });
  it("singular wording", () => {
    const m = run((y) => (y <= 2004 ? 10 : 11));
    expect(m.headline).toBe("1 more day a year");
    const d = run((y) => (y <= 2004 ? 11 : 10));
    expect(d.headline).toBe("1 fewer day a year");
  });
});

describe("wording agrees with numbers across a grid", () => {
  const earlyHot = [0, 20, 90];
  const deltas = [-40, -6, -1, 0, 1, 6, 40];
  const jitters = [0, 1, 8];
  const forbidden = /statistically|caused|climate change|[+-]\d|NaN|undefined|null/i;

  for (const eh of earlyHot)
    for (const dl of deltas)
      for (const j of jitters) {
        it(`hot ${eh} delta ${dl} jitter ${j}`, () => {
          const wig = (y: number) => Math.round(Math.sin(y * 12.9898) * j);
          const g: Gen = (y, d) => ({
            tMaxC: d <= Math.max(0, eh + (y > 2005 ? dl : 0) + wig(y)) ? 40 : 25,
            precipMm: y > 2005 ? 1 + dl / 100 + 0.01 : 1,
          });
          const r = ok(computeShift(makePower(1985, 2025, g)));
          for (const m of Object.values(r.metrics) as MetricShift[]) checkConsistent(m);
          // overall
          const verdicts = Object.values(r.metrics).map((m) => m.verdict);
          const anyClear = verdicts.some((v) => v === "increase" || v === "decrease");
          if (anyClear) expect(r.overallHeadline).toMatch(/shifted/);
          else expect(r.overallHeadline).toMatch(/No clear shift/); // no insufficient metric in this grid
          expect(r.overallHeadline + r.overallDetail).not.toMatch(forbidden);
        });
      }

  function checkConsistent(m: MetricShift) {
    const text = m.headline + " " + m.detail;
    expect(text).not.toMatch(forbidden);
    if (m.diff === null) {
      expect(m.verdict).toBe("insufficient-data");
      return;
    }
    const rounded = roundInt(m.diff);
    if (m.verdict === "no-clear-change") {
      expect(m.headline).toBe("No clear change");
      return;
    }
    const shown = roundInt(m.late.mean!) - roundInt(m.early.mean!);
    expect(shown).not.toBe(0);
    expect(Math.sign(shown)).toBe(m.verdict === "increase" ? 1 : -1);
    const shownTxt = Math.abs(shown).toLocaleString("en-US");
    expect(m.headline).toContain(shownTxt);
    expect(m.detail).toContain(`averaged ${m.id === "hotDays" ? roundInt(m.early.mean!) : roundInt(m.early.mean!).toLocaleString("en-US")}`);
    expect(m.detail).toContain(`: ${shownTxt} `);
    expect(rounded).not.toBe(0);
    expect(Math.sign(rounded)).toBe(m.verdict === "increase" ? 1 : -1);
    const n = shownTxt;
    if (m.id === "hotDays") {
      expect(m.headline).toContain(m.verdict === "increase" ? `${n} more` : `${n} fewer`);
      expect(m.detail).toContain(m.verdict === "increase" ? "more day" : "fewer day");
    } else if (m.id === "et0") {
      expect(m.headline).toContain(m.verdict === "increase" ? "up" : "down");
      expect(m.detail).toContain(m.verdict === "increase" ? "higher" : "lower");
    } else {
      expect(m.headline).toContain(m.verdict === "increase" ? "Rain up" : "Rain down");
      expect(m.detail).toContain(m.verdict === "increase" ? "more rain" : "less rain");
    }
    expect(m.headline).toContain(n);
  }
});

describe("displayed difference equals round(late) - round(early)", () => {
  for (const pin of ["brentwood", "fresno", "ludhiana"]) {
    it(`${pin}`, async () => {
      const r = ok(computeShift(await loadSavedDemoPin(pin)));
      for (const m of Object.values(r.metrics)) {
        const shown = Math.abs(roundInt(m.late.mean!) - roundInt(m.early.mean!)).toLocaleString("en-US");
        if (m.verdict !== "no-clear-change") expect(m.headline).toContain(shown);
        expect(m.detail).toContain(`: ${shown} `);
        expect(m.detail).not.toMatch(/[+-]\d/);
      }
    });
  }
});

describe("overall wording by number of clear metrics", () => {
  const hotGen = (y: number, d: number) => ({ tMaxC: d <= (y <= 2004 ? 20 : 40) ? 40 : 25 });
  const rainGen = (y: number) => ({ precipMm: y <= 2004 ? 1 : 3 });
  const dryHot = (y: number, d: number) => ({ tMaxC: d <= (y <= 2004 ? 20 : 40) ? 40 : 25, tMinC: 12 + (y <= 2004 ? 0 : 8) });
  it("0 clear", () => {
    const r = ok(computeShift(makePower(1985, 2025)));
    expect(r.overallHeadline).toMatch(/^No clear shift/);
    expect(r.overallDetail).not.toMatch(/has shifted/);
  });
  it("1 clear names only that metric, others listed as unchanged with 'or'", () => {
    const r = ok(computeShift(makePower(1985, 2025, hotGen)));
    // hot-day change can also move ET0 via tMax; check only what is clear
    const clear = Object.values(r.metrics).filter((m) => m.verdict === "increase" || m.verdict === "decrease");
    const steady = Object.values(r.metrics).filter((m) => m.verdict === "no-clear-change");
    expect(clear.length).toBeGreaterThanOrEqual(1);
    expect(r.overallHeadline).toContain("more days over 35 °C");
    if (clear.length === 1) {
      expect(r.overallHeadline).not.toMatch(/water demand|rain/);
      expect(r.overallDetail).toMatch(/No clear change in crop water demand \(ET0\) or rainfall\./);
    }
    expect(steady.length + clear.length).toBe(3);
  });
  it("2 clear (hot days + rain)", () => {
    const r = ok(computeShift(makePower(1985, 2025, (y, d) => ({ ...hotGen(y, d), ...rainGen(y) }))));
    expect(r.overallHeadline).toContain("more rain");
    expect(r.overallHeadline).toContain(" and ");
    if (r.metrics.et0.verdict === "no-clear-change") expect(r.overallDetail).toMatch(/No clear change in crop water demand \(ET0\)\./);
  });
  it("3 clear uses commas and a final 'and'", () => {
    const r = ok(computeShift(makePower(1985, 2025, (y, d) => ({ ...dryHot(y, d), ...rainGen(y), wind2mMs: y <= 2004 ? 2 : 4 }))));
    const verdicts = Object.values(r.metrics).map((m) => m.verdict);
    expect(verdicts.every((v) => v === "increase" || v === "decrease")).toBe(true);
    expect(r.overallHeadline).toMatch(/, .*, and /);
    expect(r.overallDetail).not.toMatch(/No clear change in/);
  });
  it("0 clear plus one insufficient metric", () => {
    const r = ok(computeShift(makePower(1985, 2025, () => ({}), { elevationM: null })));
    expect(r.overallHeadline).not.toMatch(/No clear shift/i);
    expect(r.overallHeadline).toMatch(/^Not enough complete data to compare crop water demand \(ET0\)/);
    expect(r.overallDetail).toMatch(/Not enough complete data to compare crop water demand \(ET0\)\./);
    expect(r.overallDetail).toMatch(/days over 35 °C and rainfall/);
  });
  it("0 clear plus fewer than 15 usable years in one metric: headline says not enough data and names it, never 'no clear shift'", () => {
    const g: Gen = (y, d) => (y >= 1990 && y <= 1995 && d <= 11 ? { precipMm: null } : {}); // 14 usable early years for rainfall
    const r = ok(computeShift(makePower(1985, 2025, g)));
    expect(r.metrics.precip.verdict).toBe("insufficient-data");
    expect(r.metrics.hotDays.verdict).toBe("no-clear-change");
    expect(r.overallHeadline).toMatch(/^Not enough complete data to compare rainfall/);
    expect(r.overallHeadline).not.toMatch(/no clear shift/i);
    expect(r.overallDetail).toMatch(/Not enough complete data to compare rainfall\./);
  });
  it("0 clear and nothing insufficient still says no clear shift", () => {
    const r = ok(computeShift(makePower(1985, 2025)));
    expect(r.overallHeadline).toMatch(/^No clear shift/);
  });
  it("a clear shift plus one insufficient metric still reports the shift and says what could not be compared", () => {
    const g: Gen = (y, d) => ({ ...(y >= 1990 && y <= 1995 && d <= 11 ? { precipMm: null } : {}), tMaxC: d <= (y <= 2004 ? 20 : 40) ? 40 : 25 });
    const r = ok(computeShift(makePower(1985, 2025, g)));
    expect(r.overallHeadline).toMatch(/shifted/);
    expect(r.overallDetail).toMatch(/Not enough complete data to compare rainfall/);
  });
  it("all insufficient", () => {
    const r = ok(computeShift(makePower(2000, 2010)));
    expect(r.overallHeadline).toMatch(/not enough complete data/i);
    expect(r.overallDetail).toMatch(/days over 35 °C, crop water demand \(ET0\), or rainfall/);
  });
});

describe("overall wording", () => {
  it("says plainly when nothing shifted", () => {
    const r = ok(computeShift(makePower(1985, 2025)));
    expect(r.overallHeadline).toMatch(/^No clear shift in this field's regional climate between 1985–2004 and 2006–2025/);
  });
  it("names what shifted", () => {
    const r = ok(computeShift(makePower(1985, 2025, hotAbove((y) => (y <= 2004 ? 20 : 40)))));
    expect(r.overallHeadline).toContain("more days over 35 °C");
    expect(r.overallDetail).toMatch(/No clear change in/);
  });
  it("all insufficient says not enough data", () => {
    const r = ok(computeShift(makePower(2000, 2010)));
    expect(r.overallHeadline).toMatch(/not enough complete data/i);
  });
});

describe("real saved demo pins", () => {
  for (const pin of ["brentwood", "fresno", "ludhiana"]) {
    it(`${pin}: ok, 41 years per metric, no flags, physical bounds`, async () => {
      const r = ok(computeShift(await loadSavedDemoPin(pin)));
      for (const m of Object.values(r.metrics)) {
        expect(m.years).toHaveLength(41);
        expect(m.years.filter((y) => y.flagged)).toEqual([]);
        expect(m.verdict).not.toBe("insufficient-data");
        for (const y of m.years) expect(Number.isFinite(y.value)).toBe(true);
        expect(Number.isFinite(m.diff)).toBe(true);
        expect(Number.isFinite(m.standardError)).toBe(true);
      }
      for (const y of r.metrics.hotDays.years) {
        expect(y.value!).toBeGreaterThanOrEqual(0);
        expect(y.value!).toBeLessThanOrEqual(366);
      }
      for (const y of r.metrics.et0.years) {
        expect(y.value!).toBeGreaterThan(300);
        expect(y.value!).toBeLessThan(3000);
      }
      for (const y of r.metrics.precip.years) {
        expect(y.value!).toBeGreaterThanOrEqual(0);
        expect(y.value!).toBeLessThan(3000);
      }
      expect(r.overallHeadline.length).toBeGreaterThan(10);
    });
  }
});

// keep type import used
export type _Unused = MetricId;

describe("direction text and shown difference", () => {
  it("directionText is factual per metric and null without a clear change", async () => {
    const { directionText } = await import("./direction");
    expect(directionText("hotDays", "increase")).toBe("More days over 35 °C");
    expect(directionText("hotDays", "decrease")).toBe("Fewer days over 35 °C");
    expect(directionText("et0", "increase")).toBe("Higher crop water demand");
    expect(directionText("et0", "decrease")).toBe("Lower crop water demand");
    expect(directionText("precip", "increase")).toBe("More rain");
    expect(directionText("precip", "decrease")).toBe("Less rain");
    expect(directionText("precip", "no-clear-change")).toBeNull();
    expect(directionText("precip", "insufficient-data")).toBeNull();
    for (const id of ["hotDays", "et0", "precip"] as const) expect(directionText(id, "increase")).not.toMatch(/strain/i);
  });
  it("shownDiff is round(late) minus round(early), so inches derive from the printed mm", async () => {
    const { shownDiff } = await import("./compute");
    expect(shownDiff({ early: { mean: 100.4 }, late: { mean: 200.6 } })).toBe(101); // 201 - 100; unrounded gap is 100.2
    expect(shownDiff({ early: { mean: null }, late: { mean: 5 } })).toBe(0);
  });
});
