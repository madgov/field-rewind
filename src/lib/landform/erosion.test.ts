import { describe, expect, it } from "vitest";
import { EROSION_LABEL, erosionIndicator, slopeBand } from "./erosion";
import { landformWording } from "./wording";
import { loadSavedLandformSync } from "./saved";

describe("slope bands (NSSH 622.23 breaks 0-2, 2-9, 9-15, 15+)", () => {
  it("puts a value exactly on a break in the steeper band", () => {
    expect(slopeBand(0)?.label).toBe("0 to 2 percent");
    expect(slopeBand(1.99)?.label).toBe("0 to 2 percent");
    expect(slopeBand(2)?.label).toBe("2 to 9 percent");
    expect(slopeBand(9)?.label).toBe("9 to 15 percent");
    expect(slopeBand(15)?.label).toBe("15 percent or steeper");
    expect(slopeBand(80)?.toPct).toBeNull();
    expect(slopeBand(null)).toBeNull();
    expect(slopeBand(-1)).toBeNull();
  });
});

describe("erosion indicator", () => {
  it("never produces a combined class and carries the required label", () => {
    const e = erosionIndicator(12, 0.43);
    expect(e.combinedClass).toBeNull();
    expect(e.kfClassRank).toBe(11);
    expect(e.label).toBe(EROSION_LABEL);
    expect(EROSION_LABEL).toBe("Erosion risk indicator from slope and soil erodibility, not a soil-loss prediction");
  });
});

describe("wording comes only from computed numbers", () => {
  it("every number in the saved Brentwood wording is traceable to the result", () => {
    const r = loadSavedLandformSync("brentwood");
    const w = landformWording(r).all.join(" ");
    expect(w).toContain("12 m above sea level");
    expect(w).toContain("1.9 percent");
    expect(w).toContain("clay: 15 percent sand, 35 percent silt, 50 percent clay");
    expect(w).toContain("Hydrologic soil group C");
    expect(w).toContain("Kf: 0.24 (class 7 of 14");
    expect(w).toMatch(/No combined erosion class/);
    expect(w).toMatch(/surface model/);
  });
  it("Ludhiana says SSURGO covers the United States only and gives no soil numbers", () => {
    const r = loadSavedLandformSync("ludhiana");
    expect(r.status).toBe("ok");
    expect(r.soil.status).toBe("no-coverage");
    const w = landformWording(r);
    expect(w.soil.join(" ")).toMatch(/United States only/);
    expect(w.all.join(" ")).not.toMatch(/mm of water/);
  });
  it("saved wording says it is a saved response with a date, never fetched just now", () => {
    const w = landformWording(loadSavedLandformSync("fresno"));
    expect(w.originLine).toMatch(/^Saved response from \d{1,2} \w{3} \d{4}/);
    expect(w.originLine).not.toMatch(/just now/);
  });
});
