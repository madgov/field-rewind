import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSavedOpenEt, getOpenEtMonthly } from "./index";
import { monthsInRange, normalizeOpenEt, OpenEtShapeError } from "./normalize";

describe("normalizeOpenEt", () => {
  it("maps dates to YYYY-MM, nulls missing, sorts", () => {
    const n = normalizeOpenEt([{ time: "2023-02-01", et: 5.5 }, { time: "2023-01-01", et: null }]);
    expect(n.series).toEqual([{ month: "2023-01", etMm: null }, { month: "2023-02", etMm: 5.5 }]);
    expect(n.unitsReported).toBeNull();
  });
  it("accepts mm and rejects other units without converting", () => {
    expect(normalizeOpenEt([{ time: "2023-01-01", et: 1, units: "mm" }]).unitsReported).toBe("mm");
    expect(() => normalizeOpenEt([{ time: "2023-01-01", et: 1, units: "in" }])).toThrow(OpenEtShapeError);
  });
  it("rejects unknown shapes and duplicates", () => {
    expect(() => normalizeOpenEt({ a: 1 })).toThrow(/not a list/);
    expect(() => normalizeOpenEt([{ foo: 1 }])).toThrow(/lacks/);
    expect(() => normalizeOpenEt([{ time: "2023-01-01", et: 1 }, { time: "2023-01-15", et: 2 }])).toThrow(/duplicate/);
  });
  it("monthsInRange is inclusive", () => {
    expect(monthsInRange("2022-11-01", "2023-02-28")).toEqual(["2022-11", "2022-12", "2023-01", "2023-02"]);
  });
});

describe("saved responses", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openet-"));
  it("returns no-saved-data with next step, never a series", async () => {
    const r = await loadSavedOpenEt("brentwood", dir);
    expect(r.status).toBe("no-saved-data");
    expect(JSON.stringify(r)).toContain("OPENET_API_KEY");
    expect(r).not.toHaveProperty("result");
  });
  it("loads a saved file through the normalizer and labels it as saved", async () => {
    const f = { pinId: "testpin", lon: 1, lat: 2, fetchedAt: "2024-04-10T00:00:00.000Z", request: { date_range: ["2023-01-01", "2023-02-28"] }, response: [{ time: "2023-01-01", et: 3 }, { time: "2023-02-01", et: 4 }] };
    writeFileSync(path.join(dir, "testpin.json"), JSON.stringify(f));
    const r = await loadSavedOpenEt("testpin", dir);
    expect(r).toMatchObject({ status: "saved", label: "saved response from 2024-04-10" });
  });
  it("getOpenEtMonthly: demo pin with nothing saved and no key -> saved-missing/no-key; Ludhiana -> no-coverage", async () => {
    const a = await getOpenEtMonthly(37.93, -121.66, { apiKey: null, dir });
    expect(a.source).toBe("saved-missing");
    expect("result" in a && a.result.status).toBe("no-key");
    const b = await getOpenEtMonthly(30.9, 75.85, { apiKey: "k", dir, fetchImpl: () => Promise.reject(new Error("must not be called")) });
    expect("result" in b && b.result.status).toBe("no-coverage");
  });
});
