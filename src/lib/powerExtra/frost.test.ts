import { describe, expect, it } from "vitest";
import { computeFrost, crossCheckFrostFlag, frostDateOf, frostYear, refDayText } from "./frost";
import { normalizePowerExtra } from "./normalize";
import { makeExtraRaw, yearDays } from "./testFixtures";

const withFrost = (year: number, dates: string[]) => yearDays(year, (d) => (dates.includes(d) ? { frostFlag: 1 } : {}));

describe("day-of-year", () => {
  it("handles leap days and the reference calendar", () => {
    expect(frostDateOf("2011-01-01")).toMatchObject({ dayOfYear: 1, refDayOfYear: 1 });
    expect(frostDateOf("2011-12-31")).toMatchObject({ dayOfYear: 365, refDayOfYear: 365 });
    expect(frostDateOf("2012-02-28")).toMatchObject({ dayOfYear: 59, refDayOfYear: 59 });
    expect(frostDateOf("2012-02-29")).toMatchObject({ dayOfYear: 60, refDayOfYear: 59 });
    expect(frostDateOf("2012-03-01")).toMatchObject({ dayOfYear: 61, refDayOfYear: 60 });
    expect(frostDateOf("2012-12-31")).toMatchObject({ dayOfYear: 366, refDayOfYear: 365 });
    expect(refDayText(1)).toBe("1 Jan");
    expect(refDayText(60)).toBe("1 Mar");
    expect(refDayText(365)).toBe("31 Dec");
  });
});

describe("frostYear definitions", () => {
  it("a year with no frost: zero days, no dates, frost-free season is the whole year", () => {
    const y = frostYear(2011, yearDays(2011), true);
    expect(y.flagged).toBe(false);
    expect(y.frostDays).toBe(0);
    expect(y.lastSpringFrost).toBeNull();
    expect(y.firstAutumnFrost).toBeNull();
    expect(y.noSpringFrost).toBe(true);
    expect(y.noAutumnFrost).toBe(true);
    expect(y.frostFreeDays).toBe(365);
    expect(frostYear(2012, yearDays(2012), true).frostFreeDays).toBe(366);
  });

  it("frost on 1 January is a spring frost and starts the season on 2 January", () => {
    const y = frostYear(2011, withFrost(2011, ["2011-01-01"]), true);
    expect(y.lastSpringFrost?.date).toBe("2011-01-01");
    expect(y.firstAutumnFrost).toBeNull();
    expect(y.frostFreeDays).toBe(364);
  });

  it("frost on 31 December is an autumn frost and the season ends 30 December", () => {
    const y = frostYear(2011, withFrost(2011, ["2011-12-31"]), true);
    expect(y.firstAutumnFrost?.date).toBe("2011-12-31");
    expect(y.lastSpringFrost).toBeNull();
    expect(y.frostFreeDays).toBe(364);
  });

  it("splits at 1 July: 30 June is spring, 1 July is autumn", () => {
    const y = frostYear(2011, withFrost(2011, ["2011-03-10", "2011-06-30", "2011-07-01", "2011-11-20", "2011-12-01"]), true);
    expect(y.frostDays).toBe(5);
    expect(y.lastSpringFrost?.date).toBe("2011-06-30");
    expect(y.firstAutumnFrost?.date).toBe("2011-07-01");
    // day 181 = 30 Jun, day 182 = 1 Jul: no frost-free day between
    expect(y.frostFreeDays).toBe(0);
  });

  it("frost-free season between a typical last spring and first autumn frost", () => {
    // 10 Mar = day 69 (2011), 20 Nov = day 324: days 70..323 = 254
    const y = frostYear(2011, withFrost(2011, ["2011-02-01", "2011-03-10", "2011-11-20", "2011-12-15"]), true);
    expect(y.lastSpringFrost).toMatchObject({ date: "2011-03-10", dayOfYear: 69 });
    expect(y.firstAutumnFrost).toMatchObject({ date: "2011-11-20", dayOfYear: 324 });
    expect(y.frostFreeDays).toBe(254);
  });

  it("leap year: 29 Feb frost counts, season length uses real day numbers", () => {
    // 29 Feb = day 60; 1 Dec 2012 = day 336: days 61..335 = 275
    const y = frostYear(2012, withFrost(2012, ["2012-02-29", "2012-12-01"]), true);
    expect(y.lastSpringFrost).toMatchObject({ dayOfYear: 60, refDayOfYear: 59 });
    expect(y.frostFreeDays).toBe(275);
  });

  it("a missing flag is not counted as frost; more than 10 missing days flags the year", () => {
    const days = withFrost(2011, ["2011-01-05"]).map((d, i) => (i >= 20 && i < 30 ? { ...d, frostFlag: null } : d));
    const ok = frostYear(2011, days, true);
    expect(ok.flagged).toBe(false);
    expect(ok.missingDays).toBe(10);
    expect(ok.frostDays).toBe(1);
    const bad = frostYear(2011, withFrost(2011, []).map((d, i) => (i < 11 ? { ...d, frostFlag: null } : d)), true);
    expect(bad.flagged).toBe(true);
    expect(bad.frostDays).toBeNull();
    expect(bad.frostFreeDays).toBeNull();
  });

  it("southern hemisphere: counts yes, dates and season not defined", () => {
    const y = frostYear(2011, withFrost(2011, ["2011-07-10", "2011-08-01"]), false);
    expect(y.frostDays).toBe(2);
    expect(y.lastSpringFrost).toBeNull();
    expect(y.frostFreeDays).toBeNull();
  });
});

describe("cross-check against T2M_MIN <= 0", () => {
  it("counts agreements and disagreements and ignores missing values", () => {
    const extra = { days: yearDays(2011, (d) => (d === "2011-01-02" || d === "2011-01-03" ? { frostFlag: 1 } : d === "2011-01-05" ? { frostFlag: null } : {})) };
    const power = {
      days: extra.days.map((d) => ({
        date: d.date, tMaxC: 10, rhPct: 50, wind2mMs: 1, solarMJm2: 1, precipMm: 0,
        // 1 Jan: 0 C (<=0) but flag 0 -> disagreement; 2 Jan: -1 and flag 1 -> agree; 3 Jan: 2 C but flag 1 -> disagreement
        tMinC: d.date === "2011-01-01" ? 0 : d.date === "2011-01-02" ? -1 : d.date === "2011-01-03" ? 2 : d.date === "2011-01-04" ? null : 5,
      })),
    };
    const c = crossCheckFrostFlag(extra, power);
    expect(c.disagreements).toBe(2);
    expect(c.daysCompared).toBe(365 - 2); // the null T2M_MIN day and the null flag day are skipped
    expect(c.examples.map((e) => e.date)).toEqual(["2011-01-01", "2011-01-03"]);
  });
});

describe("computeFrost on a built record", () => {
  const build = (frostPerYear: (year: number) => string[]) => {
    const raw = makeExtraRaw({
      start: "1985-01-01",
      end: "2025-12-31",
      value: (p, d) => {
        if (p !== "FROST_DAYS") return undefined;
        return frostPerYear(Number(d.slice(0, 4))).includes(d) ? 1 : 0;
      },
    });
    return normalizePowerExtra({ lat: 37.93, lon: -121.66, responses: [raw], fetchedAt: "2026-01-01T00:00:00.000Z", sourceUrls: [], origin: "saved" });
  };
  const jan = (year: number, n: number) => Array.from({ length: n }, (_, i) => `${year}-01-${String(i + 1).padStart(2, "0")}`);

  it("reports a clear fall in frost days with the right periods, and excludes 2005", () => {
    const r = computeFrost(build((y) => (y === 2005 ? jan(y, 30) : jan(y, y <= 2004 ? 11 : 6))));
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.years).toHaveLength(41);
    expect(r.frostDays.early.mean).toBe(11);
    expect(r.frostDays.late.mean).toBe(6);
    expect(r.frostDays.verdict).toBe("decrease");
    expect(r.frostDays.shownDiff).toBe(-5);
    expect(r.years.find((y) => y.year === 2005)?.period).toBe("none");
    expect(r.frostDays.years.find((y) => y.year === 2005)?.period).toBe("none");
    // every year's last spring frost is 11 Jan or 6 Jan
    expect(r.lastSpringFrost.early.mean).toBe(11);
    expect(r.lastSpringFrost.late.mean).toBe(6);
    expect(r.lastSpringFrost.medianRefDayEarly).toBe(11);
    expect(r.firstAutumnFrost.verdict).toBe("insufficient-data");
    expect(r.firstAutumnFrost.yearsWithoutEarly).toBe(20);
    expect(r.crossCheck).toBeNull();
  });

  it("reports no clear change when both periods are the same", () => {
    const r = computeFrost(build((y) => jan(y, 8)));
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.frostDays.verdict).toBe("no-clear-change");
    expect(r.frostDays.shownDiff).toBe(0);
  });

  it("is unavailable for an error result", () => {
    const err = normalizePowerExtra({ lat: 1, lon: 1, responses: [], fetchedAt: "2026-01-01T00:00:00.000Z", sourceUrls: [], origin: "live" });
    expect(computeFrost(err).status).toBe("unavailable");
  });
});
