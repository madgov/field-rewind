import { describe, expect, it } from "vitest";
import type { DailyRecord } from "../types";
import {
  actualVapourPressureFromRhMaxMin,
  actualVapourPressureFromRhMean,
  clearSkyRadiation,
  dayOfYear,
  daylightHours,
  degToRad,
  et0Daily,
  et0DailyDetailed,
  et0FromDailyRecord,
  extraterrestrialRadiation,
  inverseRelativeDistance,
  meanSaturationVapourPressure,
  netLongwaveRadiation,
  netShortwaveRadiation,
  pressureKPa,
  psychrometricConstant,
  relativeShortwave,
  saturationVapourPressure,
  slopeSatVapourPressure,
  solarDeclination,
  solarFromSunshine,
  sunsetHourAngle,
  windAt2m,
  RS_RSO_TOTAL_CLOUD,
  type Et0Input,
} from "./fao56";

/**
 * Tolerance helper: asserts |actual - printed| < half a unit in the last digit FAO-56 prints.
 * e.g. printed 0.122 (3 dp) -> tolerance 0.0005. (vitest toBeCloseTo(x, d) = 10^-d / 2.)
 */
const close = (actual: number, printed: number, decimals: number) =>
  expect(actual).toBeCloseTo(printed, decimals);

describe("FAO-56 Example 18 (Uccle, Brussels, 6 July)", () => {
  // Inputs, all from the document (Chapter 4, Example 18).
  const latDeg = 50 + 48 / 60; // 50 deg 48' N = 50.80
  const elevationM = 100;
  const tMaxC = 21.5;
  const tMinC = 12.3;
  const rhMaxPct = 84;
  const rhMinPct = 63;
  const windKmhAt10m = 10;
  const sunshineH = 9.25;
  const doy = dayOfYear("2001-07-06");

  // Chain: wind conversion -> Ra, N -> Rs from sunshine -> et0Daily.
  const u2 = windAt2m(windKmhAt10m / 3.6, 10);
  const ra = extraterrestrialRadiation(latDeg, doy);
  const N = daylightHours(latDeg, doy);
  const rs = solarFromSunshine(sunshineH, N, ra);
  const input: Et0Input = {
    tMaxC, tMinC, rhMaxPct, rhMinPct, wind2mMs: u2, solarMJm2: rs, latDeg, elevationM, dayOfYear: doy,
  };
  const d = et0DailyDetailed(input);

  it("reproduces the published 3.9 mm/day within 0.1 (FAO computed 3.88)", () => {
    expect(Math.abs(et0Daily(input) - 3.9)).toBeLessThan(0.1);
    close(et0Daily(input), 3.88, 2);
  });

  it("day of year J = 187", () => expect(doy).toBe(187));

  it("wind: 10 km/h at 10 m -> u2 = 2.078 m/s (document prints '2,078')", () => {
    close(u2, 2.078, 3);
    close(0.748 * 2.78, 2.079, 3); // the document's own rounded arithmetic
  });

  it("parameters: P, Tmean, Delta, gamma, and the weighting factors", () => {
    close(d.pressureKPa, 100.1, 1);
    close(d.tMeanC, 16.9, 1);
    close(d.delta, 0.122, 3);
    close(d.gamma, 0.0666, 4);
    const wind = 1 + 0.34 * u2;
    close(wind, 1.71, 2);
    close(d.delta / (d.delta + d.gamma * wind), 0.518, 3);
    close(d.gamma / (d.delta + d.gamma * wind), 0.282, 3);
    close((900 / (d.tMeanC + 273)) * u2, 6.45, 2);
  });

  it("vapour pressure: e0(Tmax), e0(Tmin), es, ea (Eq. 17), deficit", () => {
    close(saturationVapourPressure(tMaxC), 2.564, 3);
    close(saturationVapourPressure(tMinC), 1.431, 3);
    close(d.es, 1.997, 3);
    close(d.ea, 1.409, 3);
    close(d.es - d.ea, 0.589, 3);
  });

  it("radiation: Ra, N, n/N, Rs, Rso, Rs/Rso, Rns", () => {
    close(ra, 41.09, 2);
    // Document prints N = 16.1 in one line and 16.3 in the next (typo); 16.1 is the computed value.
    close(N, 16.1, 1);
    close(sunshineH / N, 0.57, 2);
    close(rs, 22.07, 2);
    close(d.rso, 30.9, 2);
    close(d.rsOverRso, 0.71, 2);
    close(d.rns, 17.0, 2);
  });

  it("longwave: sigma*Tmax,K^4, sigma*Tmin,K^4, their mean, humidity and cloud factors, Rnl", () => {
    const sigma = 4.903e-9;
    close(sigma * Math.pow(tMaxC + 273.16, 4), 36.96, 2);
    close(sigma * Math.pow(tMinC + 273.16, 4), 32.56, 2);
    close((sigma * (Math.pow(tMaxC + 273.16, 4) + Math.pow(tMinC + 273.16, 4))) / 2, 34.76, 2);
    close(0.34 - 0.14 * Math.sqrt(d.ea), 0.17, 2);
    close(1.35 * d.rsOverRso - 0.35, 0.61, 2);
    close(d.rnl, 3.71, 2);
  });

  it("net radiation and the two ET0 terms", () => {
    close(d.rn, 13.28, 2);
    close(0.408 * d.rn, 5.42, 2);
    close(d.radiationTerm, 2.81, 2);
    close(d.aerodynamicTerm, 1.07, 2);
    close(d.et0Raw, 3.88, 2);
  });

  it("rhMean path (Eq. 19) with RHmean = (84+63)/2 = 73.5 is near, but not equal to, the Eq. 17 result", () => {
    const viaMean = et0Daily({
      tMaxC, tMinC, rhMeanPct: 73.5, wind2mMs: u2, solarMJm2: rs, latDeg, elevationM, dayOfYear: doy,
    });
    const viaMaxMin = et0Daily(input);
    // Observed: Eq. 19 gives ea ~1.468 kPa vs 1.409 for Eq. 17, so ET0 is ~0.09 mm/day lower
    // (~2.4%) for these inputs. Asserted loosely: within 0.15 mm/day, and not identical.
    expect(Math.abs(viaMean - viaMaxMin)).toBeLessThan(0.15);
    expect(viaMean).not.toBeCloseTo(viaMaxMin, 3);
    expect(viaMean).toBeGreaterThan(3.7);
    expect(viaMean).toBeLessThan(3.9);
  });
});

describe("FAO-56 Chapter 3 worked examples", () => {
  it("Example 2: pressure and gamma at 1800 m", () => {
    close(pressureKPa(1800), 81.8, 1);
    close(psychrometricConstant(81.8), 0.054, 3);
  });

  it("Example 4: pressure at 1200 m (aspirated psychrometer example)", () => {
    close(pressureKPa(1200), 87.9, 1);
    close(saturationVapourPressure(19.5), 2.267, 3);
  });

  it("slope Delta (Eq. 13) at 16.9 degC is 0.122 kPa/degC (value used in Example 18)", () => {
    close(slopeSatVapourPressure(16.9), 0.122, 3);
  });

  it("Example 3: es from Tmax 24.5 and Tmin 15, and e0(Tmean)", () => {
    close(saturationVapourPressure(24.5), 3.075, 3);
    close(saturationVapourPressure(15), 1.705, 3);
    close(meanSaturationVapourPressure(24.5, 15), 2.39, 2);
    close(saturationVapourPressure(19.75), 2.3, 1); // lower than es: why Eq. 12 is used
  });

  it("Example 5: ea from RH max/min (Eq. 17) = 1.70 and from RHmean (Eq. 19) = 1.78", () => {
    close(saturationVapourPressure(18), 2.064, 3);
    close(saturationVapourPressure(25), 3.168, 3);
    close(actualVapourPressureFromRhMaxMin(25, 18, 82, 54), 1.7, 2);
    close(actualVapourPressureFromRhMean(25, 18, (82 + 54) / 2), 1.78, 2);
  });

  it("Example 8: Ra for 3 September (J = 246) at 20 deg S", () => {
    expect(dayOfYear("2001-09-03")).toBe(246);
    close(degToRad(-20), -0.35, 2);
    close(inverseRelativeDistance(246), 0.985, 3);
    close(solarDeclination(246), 0.12, 2);
    const lat = degToRad(-20);
    close(sunsetHourAngle(lat, solarDeclination(246)), 1.527, 3);
    close(Math.sin(lat) * Math.sin(solarDeclination(246)), -0.041, 3);
    close(Math.cos(lat) * Math.cos(solarDeclination(246)), 0.933, 3);
    close(extraterrestrialRadiation(-20, 246), 32.2, 1);
    close(0.408 * extraterrestrialRadiation(-20, 246), 13.1, 1);
  });

  it("Example 9: daylight hours N = 11.7 for 3 September at 20 deg S", () => {
    close(daylightHours(-20, 246), 11.7, 1);
  });

  it("Example 10: Rs from sunshine, Rio de Janeiro in May (Ra 25.1, N 10.9, n 7.1)", () => {
    // Ra and N here are the document's tabulated values (Table 2.6/2.7, 15 May), so the
    // Angstrom formula is checked in isolation.
    // Exact arithmetic gives 14.45; the document rounds the factor to 0.58 first (0.58 x 25.1)
    // and prints 14.5, so assert within 0.1.
    expect(Math.abs(solarFromSunshine(7.1, 10.9, 25.1) - 14.5)).toBeLessThan(0.1);
    // And our own Ra/N for 22.9 deg S on J = 135 agree with those tables to the table precision.
    close(extraterrestrialRadiation(-22.9, 135), 25.1, 1);
    close(daylightHours(-22.9, 135), 10.9, 1);
  });

  it("Examples 11-12: Rso (Eq. 36 with as+bs=0.75), Rnl, Rns, Rn", () => {
    const rs = 14.5;
    const rso = clearSkyRadiation(0, 25.1); // Eq. 37 at z=0 equals 0.75 Ra
    close(rso, 18.8, 1);
    const ratio = relativeShortwave(rs, rso);
    close(ratio, 0.77, 2);
    close(netLongwaveRadiation(25.1, 19.1, 2.1, ratio), 3.5, 1);
    // 0.77 x 14.5 = 11.165; the document prints 11.1 (and Rn 7.6 from 11.1 - 3.5), i.e. it
    // truncates. We assert within 0.1 of the printed figures instead of the last digit.
    expect(Math.abs(netShortwaveRadiation(rs) - 11.1)).toBeLessThan(0.1);
    expect(
      Math.abs(netShortwaveRadiation(rs) - netLongwaveRadiation(25.1, 19.1, 2.1, ratio) - 7.6),
    ).toBeLessThan(0.1);
  });

  it("Example 14: wind at 10 m 3.2 m/s -> 2.4 m/s at 2 m (factor 0.75)", () => {
    close(4.87 / Math.log(67.8 * 10 - 5.42), 0.75, 2);
    close(windAt2m(3.2, 10), 2.4, 1);
  });

  it("windAt2m at z = 2 m is nearly the identity (Eq. 47 gives 0.998)", () => {
    expect(windAt2m(1, 2)).toBeCloseTo(1, 2);
  });
});

describe("edge cases (documented decisions)", () => {
  const base: Et0Input = {
    tMaxC: 25, tMinC: 15, rhMeanPct: 50, wind2mMs: 2, solarMJm2: 20,
    latDeg: 40, elevationM: 0, dayOfYear: 180,
  };

  it("Rs/Rso is capped at 1.0", () => {
    expect(relativeShortwave(40, 30)).toBe(1);
    expect(relativeShortwave(15, 30)).toBeCloseTo(0.5, 10);
    // Rs far above Rso gives the same ET0 radiation balance as Rs = Rso except through Rns.
    const a = et0DailyDetailed({ ...base, latDeg: 0, solarMJm2: 60 });
    expect(a.rsOverRso).toBe(1);
  });

  it("Rso ~ 0 (polar night) does not divide by zero: ratio falls back to 0.3, ET0 clamped at 0", () => {
    expect(relativeShortwave(0, 0)).toBe(RS_RSO_TOTAL_CLOUD);
    const d = et0DailyDetailed({
      ...base, latDeg: 80, dayOfYear: 355, tMaxC: -20, tMinC: -28, solarMJm2: 0,
    });
    expect(d.ra).toBe(0);
    expect(d.rso).toBe(0);
    expect(Number.isFinite(d.et0Raw)).toBe(true);
    expect(d.rsOverRso).toBe(RS_RSO_TOTAL_CLOUD);
    expect(d.et0).toBeGreaterThanOrEqual(0);
  });

  it("polar day: sunset hour angle saturates at pi, 24 h daylight, finite Ra", () => {
    expect(daylightHours(80, 172)).toBeCloseTo(24, 6);
    expect(Number.isFinite(extraterrestrialRadiation(80, 172))).toBe(true);
    expect(extraterrestrialRadiation(80, 172)).toBeGreaterThan(0);
  });

  it("negative Eq. 6 result is clamped to 0 and the raw value stays visible", () => {
    // Cold, clear low-sun winter day at 62 N: Rs = Rso so Rn is strongly negative.
    const winter: Et0Input = {
      ...base, tMaxC: -12, tMinC: -20, rhMeanPct: 80, wind2mMs: 1, solarMJm2: 0.7, latDeg: 62, dayOfYear: 355,
    };
    const d = et0DailyDetailed(winter);
    expect(d.rn).toBeLessThan(0);
    expect(d.et0Raw).toBeLessThan(0);
    expect(d.et0).toBe(0);
    expect(et0Daily(winter)).toBe(0);
  });

  it("throws RangeError on physically invalid input rather than guessing", () => {
    expect(() => et0Daily({ ...base, rhMeanPct: 120 })).toThrow(RangeError);
    expect(() => et0Daily({ ...base, wind2mMs: -1 })).toThrow(RangeError);
    expect(() => et0Daily({ ...base, solarMJm2: Number.NaN })).toThrow(RangeError);
    expect(() => et0Daily({ ...base, latDeg: 95 })).toThrow(RangeError);
    expect(() => et0Daily({ ...base, dayOfYear: 400 })).toThrow(RangeError);
  });
});

describe("dayOfYear", () => {
  it.each([
    ["2023-01-01", 1],
    ["2023-07-06", 187], // 2023 is not a leap year; J = 187 per FAO-56 Table 2.5
    ["2023-12-31", 365],
    ["2024-01-01", 1],
    ["2024-02-28", 59],
    ["2024-02-29", 60],
    ["2024-03-01", 61],
    ["2024-12-31", 366],
    ["2023-03-01", 60],
    ["2000-12-31", 366], // divisible by 400: leap
    ["1900-12-31", 365], // divisible by 100 but not 400: not leap
  ])("%s -> %i", (iso, expected) => {
    expect(dayOfYear(iso)).toBe(expected);
  });

  it("6 July in a leap year is 188", () => expect(dayOfYear("2024-07-06")).toBe(188));
  it("rejects malformed and impossible dates", () => {
    expect(() => dayOfYear("2023-02-29")).toThrow(RangeError);
    expect(() => dayOfYear("2023-13-01")).toThrow(RangeError);
    expect(() => dayOfYear("July 6")).toThrow(RangeError);
  });
});

describe("et0FromDailyRecord", () => {
  const complete: DailyRecord = {
    date: "2001-07-06",
    tMaxC: 21.5,
    tMinC: 12.3,
    rhPct: 73.5,
    wind2mMs: 2.078,
    solarMJm2: 22.07,
    precipMm: 0,
  };
  const lat = 50 + 48 / 60;

  it("returns a number for a complete record, near the Example 18 value", () => {
    const v = et0FromDailyRecord(complete, lat, 100);
    expect(v).not.toBeNull();
    expect(v as number).toBeGreaterThan(3.7);
    expect(v as number).toBeLessThan(3.9);
  });

  it("does not require precipitation", () => {
    expect(et0FromDailyRecord({ ...complete, precipMm: null }, lat, 100)).not.toBeNull();
  });

  it.each(["tMaxC", "tMinC", "rhPct", "wind2mMs", "solarMJm2"] as const)(
    "returns null when %s is null",
    (field) => {
      expect(et0FromDailyRecord({ ...complete, [field]: null }, lat, 100)).toBeNull();
    },
  );

  it("returns null (not a throw) for non-physical values such as RH > 100 or NaN", () => {
    expect(et0FromDailyRecord({ ...complete, rhPct: 140 }, lat, 100)).toBeNull();
    expect(et0FromDailyRecord({ ...complete, solarMJm2: Number.NaN }, lat, 100)).toBeNull();
    expect(et0FromDailyRecord(complete, Number.NaN, 100)).toBeNull();
  });

  it("returns null for a malformed date", () => {
    expect(et0FromDailyRecord({ ...complete, date: "bad" }, lat, 100)).toBeNull();
  });
});
