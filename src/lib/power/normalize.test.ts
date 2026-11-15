import { describe, expect, it } from "vitest";
import { splitDateRange, enumerateDays } from "./dates";
import { mergeParameters, normalizePower } from "./normalize";
import { makeRaw } from "./testFixtures";

const base = { lat: 37.93, lon: -121.66, fetchedAt: "2026-01-01T00:00:00.000Z", sourceUrls: ["u"], origin: "live" as const, start: "2025-01-01", end: "2025-01-05" };

describe("normalizePower", () => {
  it("ok: no missing values, elevation and units from the response", () => {
    const r = normalizePower({ ...base, responses: [makeRaw({ start: base.start, end: base.end, elevation: 105.1 })] });
    expect(r.status).toBe("ok");
    expect(r.days).toHaveLength(5);
    expect(r.elevationM).toBe(105.1);
    expect(r.missing).toMatchObject({ anyField: 0, totalDays: 5, tMaxC: 0 });
    expect(r.coverage).toEqual({ start: "2025-01-01", end: "2025-01-05" });
    expect(r.units.solarMJm2).toBe("MJ/m^2/day");
    expect(r.gridCell.key).toBe("38.0_-121.5");
    expect(r.fetchedAt).toBe(base.fetchedAt);
    expect(r.message).toBeUndefined();
  });

  it("converts -999 to null and counts missing per field and per day", () => {
    const raw = makeRaw({ start: base.start, end: base.end, set: { "T2M_MAX|2025-01-02": -999, "RH2M|2025-01-02": -999, "WS2M|2025-01-04": -999 } });
    const r = normalizePower({ ...base, responses: [raw] });
    expect(r.status).toBe("partial");
    expect(r.days[1].tMaxC).toBeNull();
    expect(r.days[1].rhPct).toBeNull();
    expect(r.days[1].tMinC).not.toBeNull();
    expect(r.missing).toMatchObject({ tMaxC: 1, rhPct: 1, wind2mMs: 1, tMinC: 0, anyField: 2, totalDays: 5 });
    expect(r.message).toMatch(/2 of 5 days/);
    expect(r.message).toMatch(/highest temperature: 1 day missing/);
    expect(r.message).toMatch(/humidity: 1 day missing/);
    expect(r.message).not.toMatch(/tMaxC|rhPct|solarMJm2/);
  });

  it("partial message uses thousands separators and plain names for a long range", () => {
    const raw = makeRaw({ start: "1985-01-01", end: "2025-12-31", set: { "ALLSKY_SFC_SW_DWN|1990-01-01": -999 } });
    const r = normalizePower({ ...base, start: "1985-01-01", end: "2025-12-31", responses: [raw] });
    expect(r.status).toBe("partial");
    expect(r.message).toMatch(/1 of 14,975 days/);
    expect(r.message).toMatch(/sunlight: 1 day missing/);
    expect(r.message).not.toMatch(/14975|solarMJm2/);
  });

  it("uses the header fill_value instead of -999 when different", () => {
    const raw = makeRaw({ start: base.start, end: base.end, fill: -9999, set: { "T2M_MAX|2025-01-01": -9999, "T2M_MIN|2025-01-01": -999 } });
    const r = normalizePower({ ...base, responses: [raw] });
    expect(r.days[0].tMaxC).toBeNull();
    expect(r.days[0].tMinC).toBe(-999); // not the fill value of this response
  });

  it("a day absent from the response becomes an all-null record", () => {
    const raw = makeRaw({ start: base.start, end: base.end, omit: ["2025-01-03"] });
    const r = normalizePower({ ...base, responses: [raw] });
    expect(r.days).toHaveLength(5);
    expect(r.days[2]).toEqual({ date: "2025-01-03", tMaxC: null, tMinC: null, rhPct: null, wind2mMs: null, solarMJm2: null, precipMm: null });
    expect(r.status).toBe("partial");
    expect(r.missing.anyField).toBe(1);
  });

  it("coverage uses first and last day with any value", () => {
    const set: Record<string, number | null> = {};
    for (const p of ["T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PRECTOTCORR"]) {
      set[`${p}|2025-01-01`] = -999;
      set[`${p}|2025-01-05`] = -999;
    }
    const r = normalizePower({ ...base, responses: [makeRaw({ start: base.start, end: base.end, set })] });
    expect(r.coverage).toEqual({ start: "2025-01-02", end: "2025-01-04" });
  });

  it("no-coverage when every value is missing", () => {
    const r = normalizePower({ ...base, responses: [makeRaw({ start: base.start, end: base.end, omit: enumerateDays(base.start, base.end) })] });
    expect(r.status).toBe("no-coverage");
    expect(r.coverage).toBeNull();
    expect(r.days).toHaveLength(5);
    expect(r.missing.anyField).toBe(5);
    expect(r.message).toMatch(/no valid values/);
  });

  it("error on unparseable response", () => {
    const r = normalizePower({ ...base, responses: [{ foo: 1 }] });
    expect(r.status).toBe("error");
    expect(r.days).toEqual([]);
    expect(r.coverage).toBeNull();
    expect(r.message).toMatch(/Unparseable/);
    expect(normalizePower({ ...base, responses: [] }).status).toBe("error");
  });

  it("error (no silent conversion) when units differ from the documented ones", () => {
    const raw = makeRaw({ start: base.start, end: base.end, units: { WS2M: "km/h" } });
    const r = normalizePower({ ...base, responses: [raw] });
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/Unit mismatch for WS2M.*km\/h/);
  });

  it("elevation null when the response has none", () => {
    const raw = makeRaw({ start: base.start, end: base.end });
    raw.geometry = { coordinates: [-121.66, 37.93] };
    expect(normalizePower({ ...base, responses: [raw] }).elevationM).toBeNull();
  });
});

describe("chunking", () => {
  it("splits into calendar-year-aligned chunks of at most N years", () => {
    expect(splitDateRange("1985-01-01", "2025-12-31", 41)).toEqual([{ start: "1985-01-01", end: "2025-12-31" }]);
    expect(splitDateRange("1985-01-01", "2025-12-31", 20)).toEqual([
      { start: "1985-01-01", end: "2004-12-31" },
      { start: "2005-01-01", end: "2024-12-31" },
      { start: "2025-01-01", end: "2025-12-31" },
    ]);
    expect(splitDateRange("2020-06-15", "2021-03-01", 1)).toEqual([
      { start: "2020-06-15", end: "2020-12-31" },
      { start: "2021-01-01", end: "2021-03-01" },
    ]);
    expect(splitDateRange("2025-02-01", "2025-01-01", 5)).toEqual([]);
    expect(() => splitDateRange("2025-01-01", "2025-02-01", 0)).toThrow();
  });

  it("merges chunks in date order even when supplied out of order", () => {
    const a = makeRaw({ start: "2024-12-30", end: "2024-12-31" });
    const b = makeRaw({ start: "2025-01-01", end: "2025-01-02", set: { "T2M_MAX|2025-01-01": 99 } });
    const r = normalizePower({ ...base, start: "2024-12-30", end: "2025-01-02", responses: [b, a] });
    expect(r.days.map((d) => d.date)).toEqual(["2024-12-30", "2024-12-31", "2025-01-01", "2025-01-02"]);
    expect(r.days[2].tMaxC).toBe(99);
    expect(r.status).toBe("ok");
    expect(mergeParameters([a, b]).T2M_MAX.size).toBe(4);
  });
});
