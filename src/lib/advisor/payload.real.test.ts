import { beforeAll, describe, expect, it } from "vitest";
import { CROP_CATALOG } from "../crops/catalog";
import { budgetToSupplyMm } from "../farmer";
import { landformOriginLine } from "../landform";
import { TERRAIN_CAVEAT } from "../landform/label";
import { loadSavedLandformSync } from "../landform/saved";
import { loadSavedGroundTruth } from "../groundTruth";
import { loadSavedDemoPin } from "../power";
import { powerOriginLine } from "../power/label";
import { EXAMPLE_ROTATIONS } from "../replay/examples";
import { replay } from "../replay/replay";
import { computeShift } from "../shift/compute";
import { julyMeanTmax } from "../summary/julyTmax";
import { summarizeAnnual } from "../summary/annual";
import type { PowerResult } from "../types";
import { CLIMATE_LABEL, buildAdvisorPayload, payloadNumerals } from "./payload";
import type { AdvisorInputs } from "./payload";

// Real saved NASA POWER and SSURGO/NASADEM responses. The yields and budget below are TEST INPUTS standing in for what a farmer would type.
const TEST_YIELDS = { "winter-wheat": 60, "maize-grain": 150, cotton: 2, rice: 200 };

async function inputsFor(pinId: string, name: string): Promise<{ inputs: AdvisorInputs; power: PowerResult }> {
  const power = await loadSavedDemoPin(pinId);
  const budget = budgetToSupplyMm({ units: "us", budget: 70000, waterPrice: 100, area: 100 });
  if (budget.status !== "ok") throw new Error("test budget invalid");
  const rotations = EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence }));
  const rep = replay(power, CROP_CATALOG.crops, { rotations, supplyMm: budget.supplyMm });
  const lf = loadSavedLandformSync(pinId);
  return {
    power,
    inputs: {
      pin: { id: pinId, name, lat: power.lat, lon: power.lon },
      climateOriginLine: powerOriginLine(power),
      shift: computeShift(power),
      annual: summarizeAnnual(power),
      julyTmax: julyMeanTmax(power.days),
      replay: rep,
      soil: lf.soil,
      erosion: lf.erosion,
      soilOriginLine: lf.status === "error" ? null : landformOriginLine({ origin: lf.origin, fetchedAt: lf.fetchedAt ?? "" }),
      groundTruth: await loadSavedGroundTruth(pinId),
      rotations,
      yields: TEST_YIELDS,
      budget,
      priorityOrder: ["dependable-water", "protect-soil-nutrients", "use-less-water"],
    },
  };
}

describe("advisor payload from real saved Brentwood data", () => {
  let inputs: AdvisorInputs;
  beforeAll(async () => {
    inputs = (await inputsFor("brentwood", "Brentwood, CA")).inputs;
  });

  it("carries climate, water, soil, nutrients, priorities and limits", () => {
    const p = buildAdvisorPayload(inputs);
    expect(p.climate.label).toBe(CLIMATE_LABEL);
    expect(p.climate.originLine).toMatch(/^Saved response from/);
    expect(p.water.status).toBe("ok");
    if (p.water.status !== "ok") return;
    expect(p.water.rotations).toHaveLength(3);
    for (const r of p.water.rotations) {
      expect(r.seasonsJudged + r.seasonsNotJudged).toBe(40);
      expect(r.byDecade).toHaveLength(4);
    }
    expect(p.water.supplyFromBudget).toHaveLength(3);
    expect(p.soil.status).toBe("ok");
    expect(p.nutrients.rotations).toHaveLength(3);
    expect(p.nutrients.rotations[0].water).not.toBeNull();
    expect(p.priorities.map((x) => x.priority)).toEqual(["dependable-water", "protect-soil-nutrients", "use-less-water"]);
    expect(p.limits.join(" ")).toMatch(/not a forecast/);
    expect(p.limits.join(" ")).not.toMatch(/outside California/);
    expect(String(p.water.supplyMm)).not.toMatch(/\d\.\d{2,}/);
  });

  it("says SSURGO has no nitrogen, phosphorus or potassium, and shows no N-P-K for the soil", () => {
    const p = buildAdvisorPayload(inputs);
    if (p.soil.status !== "ok") throw new Error("expected soil");
    expect(p.soil.notIncluded).toMatch(/no plant-available nitrogen/);
    expect(JSON.stringify(p.soil)).not.toMatch(/"nitrogen"|"phosphorus"|"potassium"/);
  });

  it("allow-list contains the payload's own figures and not a made-up one", () => {
    const p = buildAdvisorPayload(inputs);
    const nums = payloadNumerals(p);
    if (p.water.status !== "ok") throw new Error("expected water");
    expect(nums.has(String(p.water.rotations[0].seasonsShort))).toBe(true);
    expect(nums.has(String(Math.round(p.water.supplyMm * 100) / 100)) || nums.has(String(p.water.supplyMm))).toBe(true);
    expect(nums.has("987654")).toBe(false);
  });

  it("keeps year pairs separate: 2004 and 1985 are in the allow-list but 19852004 is not", () => {
    const nums = payloadNumerals(buildAdvisorPayload(inputs));
    expect(nums.has("2004")).toBe(true);
    expect(nums.has("1985")).toBe(true);
    expect(nums.has("19852004")).toBe(false);
  });

  it("carries the terrain caveat with the erosion indicator and in the limits", () => {
    const p = buildAdvisorPayload(inputs);
    if (p.erosion.status === "not-available") throw new Error("expected erosion");
    expect(p.erosion.caveat).toBe(TERRAIN_CAVEAT);
    expect(p.limits).toContain(TERRAIN_CAVEAT);
  });

  it("does not carry any API key or environment value", () => {
    const text = JSON.stringify(buildAdvisorPayload(inputs));
    expect(text).not.toMatch(/API_KEY|APP_KEY|sk-ant/i);
  });
});

describe("advisor payload without soil coverage (Ludhiana)", () => {
  it("marks soil not available with a reason and fills nothing in", async () => {
    const { inputs } = await inputsFor("ludhiana", "Ludhiana, Punjab");
    const p = buildAdvisorPayload(inputs);
    expect(p.soil.status).toBe("not-available");
    if (p.soil.status === "not-available") expect(p.soil.reason.length).toBeGreaterThan(10);
    expect(p.expertise.notes.map((n) => n.id)).not.toContain("munk-cotton-salinity");
    expect(p.expertise.gaps.length).toBeGreaterThan(0);
    expect(p.limits.join(" ")).toMatch(/outside California/);
  });
});

describe("advisor payload at Fresno, where the pin is developed land", () => {
  it("says the point is not cropland and tells the model not to call it a field", async () => {
    const { inputs } = await inputsFor("fresno", "Fresno, CA");
    const p = buildAdvisorPayload(inputs);
    expect(p.landCover.status).toBe("ok");
    if (p.landCover.status === "ok") {
      expect(p.landCover.notCropland).toBe(true);
      expect(p.landCover.classesSeen.length).toBeGreaterThan(0);
    }
    expect(p.limits.join(" ")).toMatch(/not cropland/);
    expect(p.limits.join(" ")).toMatch(/do not describe the point as a field/);
  });
  it("Brentwood is not flagged as non-cropland when the record shows crops", async () => {
    const { inputs } = await inputsFor("brentwood", "Brentwood, CA");
    const p = buildAdvisorPayload(inputs);
    expect(p.landCover.status).toBe("ok");
    if (p.landCover.status === "ok") expect(p.landCover.notCropland).toBe(false);
  });
});

describe("advisor payload when the replay is unavailable", () => {
  it("passes the reason through and offers no priorities", async () => {
    const { inputs } = await inputsFor("brentwood", "Brentwood, CA");
    const bad = buildAdvisorPayload({ ...inputs, replay: { status: "unavailable", cause: "power-data", reason: "No climate record.", problems: [], nextStep: "Try a demo pin." } });
    expect(bad.water.status).toBe("not-available");
    expect(bad.priorities).toEqual([]);
  });
});
