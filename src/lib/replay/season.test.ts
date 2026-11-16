import { describe, expect, it } from "vitest";
import { isoToDayNum } from "./dates";
import { checkSpansNewYear, seasonDates, validateSeasonYears } from "./season";
import { resolveCrop } from "./crop";
import { fixtureCrop } from "./testFixtures";

const summer = fixtureCrop({ id: "summer", days: [20, 30, 40, 20], plant: "04-15" });
const winter = fixtureCrop({ id: "winter", days: [30, 60, 80, 40], plant: "10-20", spans: true });

describe("season dates", () => {
  it("lays out stage boundaries day by day for a normal crop (2025)", () => {
    const s = seasonDates(summer, 2025);
    expect(s.plantingDate).toBe("2025-04-15");
    expect(s.stages.ini).toMatchObject({ startDate: "2025-04-15", endDate: "2025-05-04", days: 20 });
    expect(s.stages.dev).toMatchObject({ startDate: "2025-05-05", endDate: "2025-06-03", days: 30 });
    expect(s.stages.mid).toMatchObject({ startDate: "2025-06-04", endDate: "2025-07-13", days: 40 });
    expect(s.stages.late).toMatchObject({ startDate: "2025-07-14", endDate: "2025-08-02", days: 20 });
    expect(s.endDate).toBe("2025-08-02");
    expect(s.lengthDays).toBe(110);
    expect(s.plantedInPreviousYear).toBe(false);
  });

  it("season length is the sum of stages and end - start + 1 matches it", () => {
    for (const y of [1986, 2000, 2024, 2025]) {
      const s = seasonDates(summer, y);
      expect(s.lengthDays).toBe(110);
      expect(s.endDayNum - s.startDayNum + 1).toBe(110);
      const stageSum = Object.values(s.stages).reduce((a, st) => a + st.days, 0);
      expect(stageSum).toBe(s.lengthDays);
    }
  });

  it("stages are contiguous: each starts the day after the previous ends", () => {
    const s = seasonDates(winter, 1999);
    const order = [s.stages.ini, s.stages.dev, s.stages.mid, s.stages.late];
    for (let i = 1; i < order.length; i++) {
      expect(isoToDayNum(order[i].startDate)).toBe(isoToDayNum(order[i - 1].endDate) + 1);
    }
    expect(order[0].startDate).toBe(s.plantingDate);
    expect(order[3].endDate).toBe(s.endDate);
  });

  it("a crop that crosses 31 December is planted in the year before its harvest year; 1986 starts in 1985", () => {
    const s = seasonDates(winter, 1986);
    expect(s.plantingDate).toBe("1985-10-20");
    expect(s.endDate).toBe("1986-05-17");
    expect(s.year).toBe(1986);
    expect(s.plantedInPreviousYear).toBe(true);
    const last = seasonDates(winter, 2025);
    expect(last.plantingDate).toBe("2024-10-20");
    expect(last.endDate.slice(0, 4)).toBe("2025");
  });

  it("counts a leap day inside the season: same length, end one calendar day earlier", () => {
    const normal = seasonDates(winter, 1986); // Feb 1986 has 28 days
    const leap = seasonDates(winter, 1988); // Feb 1988 has 29 days
    expect(normal.lengthDays).toBe(210);
    expect(leap.lengthDays).toBe(210);
    expect(normal.endDate.slice(5)).toBe("05-17");
    expect(leap.endDate.slice(5)).toBe("05-16");
    expect(leap.endDayNum - leap.startDayNum + 1).toBe(210);
    expect(leap.stages.dev.startDate).toBeTruthy();
  });

  it("derives the new-year flag from dates, and surfaces a disagreement with the catalog flag", () => {
    const wrongFlag = fixtureCrop({ id: "w", days: [30, 60, 80, 40], plant: "10-20", spans: false });
    const c = checkSpansNewYear(wrongFlag);
    expect(c.derivedSpansNewYear).toBe(true);
    expect(c.agrees).toBe(false);
    expect(c.message).toMatch(/does not cross/);
    expect(checkSpansNewYear(winter).agrees).toBe(true);
    expect(checkSpansNewYear(summer).agrees).toBe(true);
    const flaggedButNot = fixtureCrop({ id: "s", days: [20, 30, 40, 20], plant: "04-15", spans: true });
    expect(checkSpansNewYear(flaggedButNot).message).toMatch(/crosses/);
  });

  it("a season ending within a day of New Year can have no valid planting year in some years: that is reported, not hidden", () => {
    const edge = fixtureCrop({ id: "edge", days: [100, 100, 100, 65], plant: "01-02" }); // 365 days
    expect(seasonDates(edge, 2024).plantedInPreviousYear).toBe(false); // leap year: ends 31 Dec 2024
    expect(() => seasonDates(edge, 2025)).toThrow(/within a day of New Year/); // 2025 planting ends 1 Jan 2026; 2024 planting ends 31 Dec 2024
    expect(validateSeasonYears(edge)).toMatch(/within a day of New Year/);
    const fine = fixtureCrop({ id: "fine", days: [100, 100, 100, 65], plant: "01-01" }); // 365 days from 1 Jan
    expect(validateSeasonYears(fine)).toBeNull();
    for (let y = 1986; y <= 2025; y++) expect(seasonDates(fine, y).endDate.slice(0, 4)).toBe(String(y));
  });

  it("rejects a 29 February planting date, a season over 365 days, a bad date and unknown stage values", () => {
    const leapDay = fixtureCrop({ id: "l", plant: "02-29" });
    const r = resolveCrop(leapDay);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/29 February/);
    expect(() => seasonDates(leapDay, 2024)).toThrow(/29 February/);
    const long = fixtureCrop({ id: "x", days: [100, 100, 100, 100] });
    expect(resolveCrop(long).ok).toBe(false);
    expect(resolveCrop(fixtureCrop({ id: "bad", plant: "13-40" })).ok).toBe(false);
    expect(resolveCrop(fixtureCrop({ id: "nokc", kc: [0.4, null, 0.6] }))).toMatchObject({ ok: false });
    // The heat threshold is optional (information only): unknown resolves with a null threshold, never a guessed one.
    expect(resolveCrop(fixtureCrop({ id: "noheat", heat: null }))).toMatchObject({ ok: true, crop: { heatThresholdC: null } });
  });
});
