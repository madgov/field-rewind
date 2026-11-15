import { describe, expect, it } from "vitest";
import type { DailyRecord } from "../types";
import { FRESNO_JULY_TMAX_NORMAL, julyMeanTmax } from "./julyTmax";

const day = (date: string, t: number | null): DailyRecord => ({ date, tMaxC: t, tMinC: 10, rhPct: 30, wind2mMs: 2, solarMJm2: 25, precipMm: 0 });
const july = (y: number, t: number, missing = 0) =>
  Array.from({ length: 31 }, (_, i) => day(`${y}-07-${String(i + 1).padStart(2, "0")}`, i < missing ? null : t));

describe("julyMeanTmax", () => {
  it("averages only complete Julys and reports the period", () => {
    const days = [...july(2000, 30), ...july(2001, 40), ...july(2002, 100, 1), day("2003-06-30", 99)];
    const r = julyMeanTmax(days);
    expect(r).toEqual({ available: true, meanC: 35, yearsUsed: 2, firstYear: 2000, lastYear: 2001 });
  });
  it("says so when no July is complete", () => {
    expect(julyMeanTmax(july(2000, 30, 2)).available).toBe(false);
    expect(julyMeanTmax([]).available).toBe(false);
  });
});

describe("Fresno station normal record", () => {
  it("carries station, period and a working source link", () => {
    expect(FRESNO_JULY_TMAX_NORMAL.station).toContain("FRESNO");
    expect(FRESNO_JULY_TMAX_NORMAL.url).toMatch(/^https:\/\/www\.ncei\.noaa\.gov\//);
    expect(FRESNO_JULY_TMAX_NORMAL.valueC).toBe(36.5);
  });
});
