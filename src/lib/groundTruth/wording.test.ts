import { describe, expect, it } from "vitest";
import { cropHistoryWording } from "./wording";
import type { CdlYear, GroundTruthOk, Layer } from "./types";
import { CDL_SOURCE } from "./label";

const yr = (year: number, name: string, value: number, agree = 9): CdlYear => ({ year, majority: { value, category: name }, sampled: 9, agree, tie: false, centre: null, counts: {} });
const empty = <T,>(): Layer<T> => ({ status: "not-checked", message: "not checked", data: null, source: CDL_SOURCE, fetchedAt: "2026-01-01T00:00:00Z", requestUrls: [] });

function g(years: CdlYear[]): GroundTruthOk {
  return {
    status: "ok", pinId: null, lat: 0, lon: 0, origin: "saved", fetchedAt: "2026-01-01T00:00:00Z",
    daymet: empty(), gauge: empty(), nlcd: empty(), wells: empty(),
    cdl: { ...empty(), status: "ok", message: "", data: { years, pixelsPerYear: 9, failedRequests: 0 } },
  };
}

describe("crop wording is generated from the numbers", () => {
  it("collapses consecutive equal years and reports agreement", () => {
    const w = cropHistoryWording(g([yr(2010, "Corn", 1), yr(2011, "Corn", 1, 7), yr(2012, "Tomatoes", 54, 5), yr(2014, "Corn", 1)]));
    expect(w.cdl[0]).toContain("2010-2011 Corn; 2012 Tomatoes; 2014 Corn");
    expect(w.cdl[1]).toBe("All 9 pixels agreed in 2 of 4 years; the weakest year was 2012 with 5 of 9 pixels agreeing.");
  });
  it("says so when one class fills every year", () => {
    const w = cropHistoryWording(g([yr(2010, "Corn", 1), yr(2011, "Corn", 1)]));
    expect(w.cdl[0]).toBe('The satellite classification calls this spot "Corn" in all 2 years from 2010 to 2011.');
  });
  it("a changed number changes the sentence", () => {
    const a = cropHistoryWording(g([yr(2010, "Corn", 1, 9)])).cdl[1];
    const b = cropHistoryWording(g([yr(2010, "Corn", 1, 4)])).cdl[1];
    expect(a).not.toBe(b);
  });
});
