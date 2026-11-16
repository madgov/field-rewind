import { describe, expect, it } from "vitest";
import { computeNdviIndicators } from "./indicators";
import { ndviWording } from "./wording";
import type { NdviObservation } from "./types";

const o = (date: string, ndvi: number): NdviObservation => ({ date, ndvi, satellite: "Landsat 8", sceneId: date });
const everything = (w: ReturnType<typeof ndviWording>) => [w.headline, w.peakLine, w.bareLine, w.stressLine, w.caveat, ...w.greenUpLines, ...w.stressItems].join("\n");

describe("ndviWording", () => {
  it("says there is no clear stress signal when there are no flags, and never prints NaN/undefined", () => {
    const obs = [2021, 2022, 2023].flatMap((y) => ["02-01", "03-15", "04-20", "05-25", "07-01", "09-01", "11-01"].map((md, k) => o(`${y}-${md}`, [0.3, 0.4, 0.6, 0.8, 0.7, 0.4, 0.3][k])));
    const w = ndviWording(computeNdviIndicators({ observations: obs }));
    expect(w.stressLine).toBe("No clear stress signal.");
    expect(w.stressItems).toEqual([]);
    expect(w.headline).toBe("21 clear satellite observations of this pixel between 2021 and 2023.");
    expect(w.peakLine).toContain("0.80");
    expect(w.bareLine).toMatch(/No clear observation was below an NDVI of 0.2/);
    expect(w.greenUpLines).toHaveLength(3);
    expect(everything(w)).not.toMatch(/NaN|undefined|null/);
  });
  it("describes a flagged day from the numbers", () => {
    const base = [2016, 2017, 2018, 2019, 2020, 2021, 2022].map((y) => o(`${y}-06-10`, 0.7));
    const w = ndviWording(computeNdviIndicators({ observations: [...base, o("2023-06-12", 0.3)] }));
    expect(w.stressItems[0]).toBe("12 Jun 2023: NDVI 0.30, 0.40 below the usual 0.70 for that time of year (7 other years compared).");
    expect(w.stressLine).toMatch(/^1 clear observation looked unusually low/);
  });
  it("handles no observations", () => {
    const w = ndviWording(computeNdviIndicators({ observations: [] }));
    expect(w.headline).toMatch(/No clear satellite observations/);
    expect(w.stressLine).toMatch(/^No clear stress signal/);
    expect(everything(w)).not.toMatch(/NaN|undefined/);
  });
  it("a year without a green-up says so with the reason", () => {
    const w = ndviWording(computeNdviIndicators({ observations: [o("2023-01-05", 0.5), o("2023-04-01", 0.52), o("2023-07-01", 0.5)] }));
    expect(w.greenUpLines[0]).toMatch(/^2023: no green-up date\. Only|^2023: no green-up date\. The seasonal rise/);
  });
});
