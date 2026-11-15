import { describe, expect, it } from "vitest";
import { normalizeCimis } from "./normalize";
import { body, rec } from "./testFixtures";

describe("normalizeCimis", () => {
  it("parses values, blanks the blank flag, sorts by date", () => {
    const r = normalizeCimis([body([rec("2020-01-02", "1.5"), rec("2020-01-01", "0.9")])]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.days).toEqual([
      { date: "2020-01-01", etoMm: 0.9, qc: null },
      { date: "2020-01-02", etoMm: 1.5, qc: null },
    ]);
    expect(r.unit).toBe("(mm)");
  });
  it("nulls empty / null / non-numeric values", () => {
    const r = normalizeCimis([body([rec("2020-01-01", ""), rec("2020-01-02", null), rec("2020-01-03", "abc"), rec("2020-01-04", "2")])]);
    if (!r.ok) throw new Error(r.message);
    expect(r.days.map((d) => d.etoMm)).toEqual([null, null, null, 2]);
    expect(r.flags.usable).toBe(1);
  });
  it("nulls values with missing-type flags (M N Q S) even if a number is present", () => {
    const r = normalizeCimis([body([rec("2020-01-01", "3", "M"), rec("2020-01-02", "3", "N"), rec("2020-01-03", "3", "Q"), rec("2020-01-04", "3", "S")])]);
    if (!r.ok) throw new Error(r.message);
    expect(r.days.every((d) => d.etoMm === null)).toBe(true);
    expect(r.days.map((d) => d.qc)).toEqual(["M", "N", "Q", "S"]);
  });
  it("keeps values for R, H, I, Y and carries the flag; counts per flag", () => {
    const r = normalizeCimis([body([rec("2020-01-01", "1", "R"), rec("2020-01-02", "2", "H"), rec("2020-01-03", "3", "Y"), rec("2020-01-04", "4", "I"), rec("2020-01-05", "5"), rec("2020-01-06", "5", "R")])]);
    if (!r.ok) throw new Error(r.message);
    expect(r.days.map((d) => d.etoMm)).toEqual([1, 2, 3, 4, 5, 5]);
    expect(r.flags.byFlag).toEqual({ R: 2, H: 1, Y: 1, I: 1, "(none)": 1 });
    expect(r.flags.nulledByFlag).toEqual({});
    expect(r.flags.usable).toBe(6);
  });
  it("nulls negative ETo", () => {
    const r = normalizeCimis([body([rec("2020-01-01", "-0.2")])]);
    if (!r.ok) throw new Error(r.message);
    expect(r.days[0].etoMm).toBeNull();
  });
  it("stops (no conversion) when the unit is not mm", () => {
    const r = normalizeCimis([body([rec("2020-01-01", "0.05", " ", "(in)")])]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not converting/i);
  });
  it("fails when no unit is ever reported", () => {
    const r = normalizeCimis([body([{ Date: "2020-01-01", Station: "47", Scope: "daily", DayAsceEto: { Value: "1", Qc: " " } }])]);
    expect(r.ok).toBe(false);
  });
  it("ignores other stations and hourly scope; dedupes dates (last wins)", () => {
    const r = normalizeCimis([body([rec("2020-01-01", "1", " ", "(mm)", "2"), { ...rec("2020-01-01", "9"), Scope: "hourly" }, rec("2020-01-01", "1"), rec("2020-01-01", "2")])]);
    if (!r.ok) throw new Error(r.message);
    expect(r.days).toHaveLength(1);
    expect(r.days[0].etoMm).toBe(2);
    expect(r.flags.otherStation).toBe(1);
    expect(r.flags.duplicateDates).toBe(1);
  });
  it("rejects an undocumented structure and empty responses", () => {
    expect(normalizeCimis([{ nope: 1 }]).ok).toBe(false);
    expect(normalizeCimis([body([])]).ok).toBe(false);
  });
});
