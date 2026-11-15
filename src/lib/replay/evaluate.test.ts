import { describe, expect, it } from "vitest";
import { dayNum, isoToDayNum } from "./dates";
import { evaluateSeason, judgeSeason, seasonNeed, validateSupply } from "./evaluate";
import { resolveCrop } from "./crop";
import { prepareClimate } from "./climate";
import { fixtureCrop, makeClimate, makePower } from "./testFixtures";
import { MAX_MISSING_SEASON_DAYS } from "./types";

// 40-day crop, Kc = 1 throughout, planted 1 June, heat threshold 35.
const flat = fixtureCrop({ id: "flat", kc: [1, 1, 1], days: [10, 10, 10, 10], plant: "06-01", heat: 35 });

describe("season evaluation", () => {
  it("ETc is the sum of Kc x ET0 over the season's days", () => {
    const c = makeClimate({ et0: () => 5 });
    const r = evaluateSeason(c, flat, 2000, 1000);
    expect(r.etcMm).toBeCloseTo(40 * 5, 9);
    expect(r.effectiveRainMm).toBe(0);
    expect(r.needMm).toBeCloseTo(200, 9);
    expect(r.status).toBe("evaluated");
  });

  it("uses the Kc curve per day (not just Kc mid)", () => {
    const curved = fixtureCrop({ id: "curved", kc: [0.5, 1.0, 0.5], days: [10, 10, 10, 10], plant: "06-01" });
    const c = makeClimate({ et0: () => 4 });
    const r = evaluateSeason(c, curved, 2000, 1000);
    // ini 10 x 0.5, dev 0.5+0.05..1.0 (mean 0.775 x 10), mid 10 x 1.0, late 1.0-0.05..0.5 (mean 0.725 x 10)
    expect(r.etcMm).toBeCloseTo(4 * (5 + 7.75 + 10 + 7.25), 9);
  });

  it("subtracts pro-rated effective rainfall: 100 mm in June, 40 of it inside a season that covers 1-10 June", () => {
    const short10 = fixtureCrop({ id: "s10", kc: [1, 1, 1], days: [3, 3, 2, 2], plant: "06-01" }); // 1-10 June
    const c = makeClimate({
      et0: () => 5,
      precip: (d) => {
        const dt = new Date(d * 86400000);
        if (dt.getUTCFullYear() !== 2000 || dt.getUTCMonth() !== 5) return 0;
        return dt.getUTCDate() <= 10 ? 4 : 60 / 20; // 10 days x 4 = 40 mm inside, 20 days x 3 = 60 mm outside: month total 100
      },
    });
    const r = evaluateSeason(c, short10, 2000, 1000);
    expect(r.effectiveRainMm).toBeCloseTo(84 * 0.4, 9);
    expect(r.etcMm).toBeCloseTo(50, 9);
    expect(r.needMm).toBeCloseTo(50 - 33.6, 9);
  });

  it("irrigation need is never negative when rain exceeds demand", () => {
    const c = makeClimate({ et0: () => 0.1, precip: () => 10 }); // wet: 300 mm months
    for (let y = 1990; y < 2000; y++) {
      const r = evaluateSeason(c, flat, y, 100);
      expect(r.needMm).toBeGreaterThanOrEqual(0);
    }
    const r = evaluateSeason(c, flat, 1995, 0);
    expect(r.needMm).toBe(0);
    expect(r.outcome).toBe("ok"); // need 0 is not greater than a supply of 0
    expect(r.needFractionOfSupply).toBeNull(); // supply 0: no fraction
  });

  it("short only when need is strictly greater than supply; exposes margin and fraction", () => {
    const c = makeClimate({ et0: () => 5 }); // need 200
    const a = evaluateSeason(c, flat, 2000, 199.99);
    expect(a.outcome).toBe("short");
    expect(a.marginMm).toBeCloseTo(-0.01, 9);
    const b = evaluateSeason(c, flat, 2000, 200);
    expect(b.outcome).toBe("ok");
    expect(b.marginMm).toBeCloseTo(0, 9);
    const g = evaluateSeason(c, flat, 2000, 400);
    expect(g.outcome).toBe("ok");
    expect(g.marginMm).toBeCloseTo(200, 9);
    expect(g.needFractionOfSupply).toBeCloseTo(0.5, 9);
    expect(a.needFractionOfSupply).toBeGreaterThan(1);
  });

  it("counts heat days above the crop's threshold, strictly, and they do not change the outcome", () => {
    const hot = (d: number) => (d % 2 === 0 ? 40 : 35); // 35.0 is not above 35
    const cHot = makeClimate({ tMax: hot });
    const cCool = makeClimate({ tMax: () => 20 });
    const rHot = evaluateSeason(cHot, flat, 2001, 150);
    const rCool = evaluateSeason(cCool, flat, 2001, 150);
    expect(rHot.heatDays).toBe(20);
    expect(rCool.heatDays).toBe(0);
    expect(rHot.needMm).toBe(rCool.needMm);
    expect(rHot.outcome).toBe(rCool.outcome);
  });

  it("10 missing ET0 days still evaluates (under-count, count carried); 11 is grey", () => {
    const start = dayNum(2000, 6, 1);
    const missing = (n: number) => (d: number) => (d >= start && d < start + n ? null : 5);
    const ten = evaluateSeason(makeClimate({ et0: missing(MAX_MISSING_SEASON_DAYS) }), flat, 2000, 1000);
    expect(ten.status).toBe("evaluated");
    expect(ten.missingEt0Days).toBe(10);
    expect(ten.etcMm).toBeCloseTo(30 * 5, 9); // no filling
    const eleven = evaluateSeason(makeClimate({ et0: missing(11) }), flat, 2000, 1000);
    expect(eleven.status).toBe("insufficient-data");
    expect(eleven.outcome).toBeNull();
    expect(eleven.needMm).toBeNull();
    expect(eleven.missingEt0Days).toBe(11);
    expect(eleven.reason).toMatch(/11 of the season's 40 days/);
  });

  it("10 missing precipitation days still evaluates (rain undercounted, count carried); 11 is grey", () => {
    const start = dayNum(2000, 6, 1);
    const missing = (n: number) => (d: number) => (d >= start && d < start + n ? null : 2);
    const ten = evaluateSeason(makeClimate({ et0: () => 5, precip: missing(MAX_MISSING_SEASON_DAYS) }), flat, 2000, 1000);
    expect(ten.status).toBe("evaluated");
    expect(ten.missingPrecipSeasonDays).toBe(10);
    const eleven = evaluateSeason(makeClimate({ et0: () => 5, precip: missing(11) }), flat, 2000, 1000);
    expect(eleven.status).toBe("insufficient-data");
    expect(eleven.outcome).toBeNull();
    expect(eleven.needMm).toBeNull();
    expect(eleven.missingPrecipSeasonDays).toBe(11);
    expect(eleven.reason).toMatch(/11 of the season's 40 days have no rainfall value/);
  });

  it("a season not fully inside the record is grey", () => {
    const winter = fixtureCrop({ id: "w", kc: [1, 1, 1], days: [30, 60, 80, 40], plant: "10-20", spans: true });
    const c = makeClimate({ start: "1986-01-01" });
    const r = evaluateSeason(c, winter, 1986, 500);
    expect(r.status).toBe("insufficient-data");
    expect(r.reason).toMatch(/only covers 1986-01-01/);
    expect(r.plantingDate).toBe("1985-10-20");
    const ok = evaluateSeason(c, winter, 1987, 500);
    expect(ok.status).toBe("evaluated");
  });

  it("a season running past the last day of the record is grey", () => {
    const c = makeClimate({ end: "2025-06-20" });
    expect(evaluateSeason(c, flat, 2025, 500).status).toBe("insufficient-data");
  });

  it("missing precipitation: not filled, counted for the season and for the months involved", () => {
    const s = isoToDayNum("2000-06-05");
    const c = makeClimate({ precip: (d) => (d >= s && d < s + 3 ? null : 1) });
    const r = evaluateSeason(c, flat, 2000, 1000);
    expect(r.missingPrecipSeasonDays).toBe(3);
    // Season is 1 Jun - 10 Jul: touches June and July. 3 missing days in June, none in July.
    expect(r.missingPrecipMonthDays).toBe(3);
    expect(r.status).toBe("evaluated"); // precipitation gaps do not by themselves make a season grey
    // month total only has the 27 available June days
    const june = makeClimate({ precip: (d) => (d >= s && d < s + 3 ? null : 1) }).months.get(2000 * 12 + 5)!;
    expect(june.totalMm).toBe(27);
    expect(june.availableDays).toBe(27);
  });

  it("counts a season day absent from the record range as missing for ET0, precip and tMax", () => {
    const c = makeClimate({ end: "2025-06-20" });
    const r = evaluateSeason(c, flat, 2025, 100);
    expect(r.missingEt0Days).toBe(20); // 21 Jun - 10 Jul
  });

  it("works from a PowerResult via the real ET0 code, and a null weather field makes that day's ET0 missing", () => {
    const p = makePower({ patch: (rec, d) => (d >= isoToDayNum("2000-06-01") && d < isoToDayNum("2000-06-04") ? { ...rec, solarMJm2: null } : rec) });
    const prep = prepareClimate(p);
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    const r = evaluateSeason(prep.climate, flat, 2000, 1000);
    expect(r.missingEt0Days).toBe(3);
    expect(r.status).toBe("evaluated");
    const clean = evaluateSeason(prep.climate, flat, 2001, 1000);
    expect(clean.etcMm!).toBeGreaterThan(100); // ~40 days x ~5 mm
    expect(clean.etcMm!).toBeLessThan(400);
  });

  it("caches the supply-independent need and rejects a bad supply", () => {
    const c = makeClimate({});
    const rc = resolveCrop(flat);
    if (!rc.ok) throw new Error("fixture");
    expect(seasonNeed(c, rc.crop, 2000)).toBe(seasonNeed(c, rc.crop, 2000));
    const need = seasonNeed(c, rc.crop, 2000);
    expect(() => judgeSeason(need, -1)).toThrow(RangeError);
    expect(() => judgeSeason(need, NaN)).toThrow(RangeError);
    expect(validateSupply(Infinity)).toMatch(/finite/);
    expect(validateSupply(-5)).toMatch(/negative/);
    expect(validateSupply(0)).toBeNull();
  });
});
