import { describe, expect, it } from "vitest";
import type { DailyRecord, PowerResult } from "@/lib/types";
import { computeShift, MAX_MISSING_DAYS_PER_YEAR } from "@/lib/shift/compute";
import type { MetricId, ShiftResult } from "@/lib/shift/types";
import { metricTone, rampColor, RAMPS, fmtValue } from "./colors";
import { demoNameFor, formatUtc, latText, lonText } from "./format";
import { heroTone } from "./Hero";
import { buildStripeProps } from "./stripeData";

// ---- test fixtures only (the app never uses these) ----
const iso = (y: number, doy: number) => new Date(Date.UTC(y, 0, doy)).toISOString().slice(0, 10);
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const FULL: Omit<DailyRecord, "date"> = { tMaxC: 25, tMinC: 12, rhPct: 50, wind2mMs: 2, solarMJm2: 18, precipMm: 1 };

/** 1985-2025. 1990 loses tMax for MAX+10 days (flagged for hot days), 2015 loses 5 days (kept, noted). */
function fixture(): PowerResult {
  const days: DailyRecord[] = [];
  for (let y = 1985; y <= 2025; y++) {
    for (let d = 1; d <= (leap(y) ? 366 : 365); d++) {
      const rec: DailyRecord = { date: iso(y, d), ...FULL, tMaxC: d <= y - 1985 ? 40 : 25 };
      if (y === 1990 && d <= MAX_MISSING_DAYS_PER_YEAR + 10) rec.tMaxC = null;
      if (y === 2015 && d <= 5) rec.tMaxC = null;
      days.push(rec);
    }
  }
  const anyField = days.filter((d) => d.tMaxC === null).length;
  return {
    status: "partial",
    lat: 36.74, lon: -119.79,
    gridCell: { key: "k", latCenter: 36.5, lonCenter: -120 },
    elevationM: 100,
    units: {} as PowerResult["units"],
    requested: { start: "1985-01-01", end: "2025-12-31" },
    coverage: { start: "1985-01-01", end: "2025-12-31" },
    missing: { tMaxC: anyField, tMinC: 0, rhPct: 0, wind2mMs: 0, solarMJm2: 0, precipMm: 0, anyField, totalDays: days.length },
    fetchedAt: "2026-01-01T00:00:00Z",
    sourceUrls: [],
    origin: "saved",
    days,
    message: "test",
  };
}
function okShift(): Extract<ShiftResult, { status: "ok" }> {
  const r = computeShift(fixture());
  if (r.status !== "ok") throw new Error("expected ok");
  return r;
}

describe("stripe mapping with a flagged year", () => {
  const shift = okShift();
  const hot = buildStripeProps(shift.metrics.hotDays);

  it("the engine itself flags 1990 and keeps it out of the early mean", () => {
    const y = shift.metrics.hotDays.years.find((v) => v.year === 1990)!;
    expect(y.flagged).toBe(true);
    expect(y.value).toBeNull();
    expect(shift.metrics.hotDays.early.flaggedYears).toEqual([1990]);
    expect(shift.metrics.hotDays.early.yearsUsed).toBe(19);
  });

  it("flagged year maps to the 'too many missing days' stripe, never to a colour", () => {
    const item = hot.items.find((i) => i.year === 1990)!;
    expect(item.color).toBeNull();
    expect(item.flagged).toBe(true);
    expect(item.text).toBe("1990: too many missing days");
    expect(item.note).toBe(`${MAX_MISSING_DAYS_PER_YEAR + 10} days missing. Left out of the averages.`);
    expect(item.note).toMatch(/Left out of the averages/);
    expect(hot.hasFlagged).toBe(true);
  });

  it("every non-flagged year with a value has a colour from the ramp; flagged years never do", () => {
    for (const y of shift.metrics.hotDays.years) {
      const item = hot.items.find((i) => i.year === y.year)!;
      if (y.flagged || y.value === null) expect(item.color).toBeNull();
      else expect(item.color).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
    }
  });

  it("a year with a few missing days keeps its colour and shows a missing-days note", () => {
    const y = shift.metrics.hotDays.years.find((v) => v.year === 2015)!;
    expect(y.flagged).toBe(false);
    const item = hot.items.find((i) => i.year === 2015)!;
    expect(item.color).not.toBeNull();
    expect(item.note).toBe("5 days missing");
  });

  it("legend min/max ignore flagged years and match the extremes of the real values", () => {
    const vals = shift.metrics.hotDays.years.filter((y) => y.value !== null).map((y) => y.value as number);
    expect(hot.legend).not.toBeNull();
    expect(hot.legend!.low).toBe(fmtValue(shift.metrics.hotDays, Math.min(...vals)));
    expect(hot.legend!.high).toBe(fmtValue(shift.metrics.hotDays, Math.max(...vals)));
    expect(hot.legend!.lowYear).not.toBe(1990);
  });

  it("the lowest value gets the first ramp colour and the highest the last", () => {
    const vals = shift.metrics.hotDays.years.filter((y) => y.value !== null) as { year: number; value: number }[];
    const lo = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const hi = vals.reduce((a, b) => (b.value > a.value ? b : a));
    expect(hot.items.find((i) => i.year === lo.year)!.color).toBe(rampColor(RAMPS.hotDays, 0));
    expect(hot.items.find((i) => i.year === hi.year)!.color).toBe(rampColor(RAMPS.hotDays, 1));
  });

  it("2005 sits in neither period and the brackets cover the two periods", () => {
    expect(hot.neitherYears).toContain(2005);
    expect(hot.brackets.map((b) => b.kind)).toEqual(["early", "late"]);
    expect(hot.items.length).toBe(41);
  });

  it("other metrics are unaffected by the tMax gap", () => {
    expect(buildStripeProps(shift.metrics.precip).hasFlagged).toBe(false);
  });
});

describe("tone mapping", () => {
  const tone = (id: MetricId, verdict: "increase" | "decrease" | "no-clear-change" | "insufficient-data") => metricTone({ id, verdict });
  it("more hot days or more water demand is pressure; less is relief", () => {
    expect(tone("hotDays", "increase")).toBe("pressure");
    expect(tone("hotDays", "decrease")).toBe("relief");
    expect(tone("et0", "increase")).toBe("pressure");
    expect(tone("et0", "decrease")).toBe("relief");
  });
  it("less rain is pressure; more rain is relief", () => {
    expect(tone("precip", "decrease")).toBe("pressure");
    expect(tone("precip", "increase")).toBe("relief");
  });
  it("no clear change is neutral, too little data is muted", () => {
    for (const id of ["hotDays", "et0", "precip"] as const) {
      expect(tone(id, "no-clear-change")).toBe("neutral");
      expect(tone(id, "insufficient-data")).toBe("muted");
    }
  });
  it("hero tone mixes when both directions occur", () => {
    const m = (id: MetricId, verdict: "increase" | "decrease") => ({ id, verdict }) as Parameters<typeof heroTone>[0][number];
    expect(heroTone([m("hotDays", "increase"), m("precip", "increase")])).toBe("mixed");
    expect(heroTone([m("hotDays", "increase"), m("et0", "increase")])).toBe("pressure");
    expect(heroTone([])).toBe("calm");
  });
});

describe("formatting helpers", () => {
  it("formats UTC dates and coordinates", () => {
    expect(formatUtc("2026-11-15T06:31:16.882Z")).toBe("15 Nov 2026, 06:31 UTC");
    expect(formatUtc("nonsense")).toMatch(/unreadable/);
    expect(latText(36.7378)).toBe("36.7378° N");
    expect(lonText(-119.7871)).toBe("119.7871° W");
  });
  it("recognises demo pins only at their coordinates", () => {
    expect(demoNameFor(36.74, -119.79)).toMatch(/Fresno/);
    expect(demoNameFor(10, 10)).toBeNull();
  });
  it("mm values show inches beside them", () => {
    expect(fmtValue({ unit: "mm per year" }, 1892)).toBe("1,892 mm (74.5 in)");
    expect(fmtValue({ unit: "days per year" }, 1)).toBe("1 day");
  });
});
