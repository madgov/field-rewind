import { describe, expect, it } from "vitest";
import { normalizePowerExtra } from "./normalize";
import { makeExtraRaw } from "./testFixtures";

const base = (raw: ReturnType<typeof makeExtraRaw>[], extra: object = {}) => ({
  lat: 37.93,
  lon: -121.66,
  responses: raw,
  fetchedAt: "2026-01-01T00:00:00.000Z",
  sourceUrls: ["u"],
  origin: "saved" as const,
  start: "2020-01-01",
  end: "2020-01-10",
  ...extra,
});

describe("normalizePowerExtra", () => {
  it("returns ok with units, coverage and zero missing for a complete response", () => {
    const r = normalizePowerExtra(base([makeExtraRaw({ start: "2020-01-01", end: "2020-01-10" })]));
    expect(r.status).toBe("ok");
    expect(r.days).toHaveLength(10);
    expect(r.units.soilRootWetness).toBe("1");
    expect(r.units.frostFlag).toBe("Days");
    expect(r.coverage).toEqual({ start: "2020-01-01", end: "2020-01-10" });
    expect(r.missing.anyField).toBe(0);
    expect(r.origin).toBe("saved");
  });

  it("turns -999 into null, counts it, and reports partial with a plain message", () => {
    const raw = makeExtraRaw({ start: "2020-01-01", end: "2020-01-10", value: (p, d) => (p === "GWETROOT" && d === "2020-01-03" ? -999 : undefined) });
    const r = normalizePowerExtra(base([raw]));
    expect(r.status).toBe("partial");
    expect(r.days[2].soilRootWetness).toBeNull();
    expect(r.days[3].soilRootWetness).toBe(0.5);
    expect(r.missing.soilRootWetness).toBe(1);
    expect(r.missing.anyField).toBe(1);
    expect(r.message).toMatch(/1 of 10 days/);
  });

  it("honours a different fill value from the response header", () => {
    const raw = makeExtraRaw({ start: "2020-01-01", end: "2020-01-10", fill: -9999, value: (p, d) => (p === "TS" && d === "2020-01-02" ? -9999 : undefined) });
    expect(normalizePowerExtra(base([raw])).days[1].skinTempC).toBeNull();
  });

  it("treats a day absent from the response as an all-null day", () => {
    const raw = makeExtraRaw({ start: "2020-01-01", end: "2020-01-10", omit: ["2020-01-05"] });
    const r = normalizePowerExtra(base([raw]));
    expect(r.days).toHaveLength(10);
    expect(r.days[4].frostFlag).toBeNull();
    expect(r.status).toBe("partial");
  });

  it("returns no-coverage when every value is the fill value", () => {
    const raw = makeExtraRaw({ start: "2020-01-01", end: "2020-01-10", value: () => -999 });
    const r = normalizePowerExtra(base([raw]));
    expect(r.status).toBe("no-coverage");
    expect(r.coverage).toBeNull();
  });

  it("rejects unexpected units with a plain message and does not convert", () => {
    const raw = makeExtraRaw({ start: "2020-01-01", end: "2020-01-10", units: { GWETROOT: "%" } });
    const r = normalizePowerExtra(base([raw]));
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/Unit mismatch for GWETROOT.*"%".*"1"/);
    expect(r.days).toEqual([]);
  });

  it("errors when a parameter is missing, when units are absent, and when there is no response", () => {
    expect(normalizePowerExtra(base([makeExtraRaw({ start: "2020-01-01", end: "2020-01-10", dropParameter: "FROST_DAYS" })])).message).toMatch(/FROST_DAYS is missing/);
    const raw = makeExtraRaw({ start: "2020-01-01", end: "2020-01-10" });
    delete raw.parameters!.TS;
    expect(normalizePowerExtra(base([raw])).message).toMatch(/does not report units for TS/);
    expect(normalizePowerExtra(base([])).status).toBe("error");
  });

  it("merges chunked responses by date", () => {
    const a = makeExtraRaw({ start: "2020-01-01", end: "2020-01-05" });
    const b = makeExtraRaw({ start: "2020-01-06", end: "2020-01-10", value: (p) => (p === "TS" ? 20 : undefined) });
    const r = normalizePowerExtra(base([a, b]));
    expect(r.status).toBe("ok");
    expect(r.days[0].skinTempC).toBe(15);
    expect(r.days[9].skinTempC).toBe(20);
  });
});
