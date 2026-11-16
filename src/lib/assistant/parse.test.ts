import { describe, expect, it } from "vitest";
import { cropWordToId, fromMentions, parseFarmerText, supplyToMm, SUPPLY_QUESTION } from "./parse";

const EXAMPLE =
  "I grow wheat then corn, I get about 2.5 acre-feet per acre, 200 acres, I can spend 30 thousand dollars on water at 150 dollars an acre-foot, I care most about not running short and keeping the soil healthy";

describe("parseFarmerText", () => {
  it("reads the example sentence", () => {
    const u = parseFarmerText(EXAMPLE);
    expect(u.rotations).toEqual([{ name: "Plan 1", sequence: ["winter-wheat", "maize-grain"] }]);
    expect(u.supplyMm).toBe(762); // 2.5 x 304.8 = 762
    expect(u.supplyAsSaid).toBe("2.5 acre-feet per acre");
    expect(u.budget).toEqual({ amount: 30000, per: "total" });
    expect(u.waterPrice).toEqual({ amount: 150, per: "acre-foot" });
    expect(u.acres).toBe(200);
    expect(u.priorities).toEqual(["dependable-water", "protect-soil-nutrients"]);
    expect(u.unmatchedCrops).toEqual([]);
    expect(u.missing).toEqual([]);
  });

  it("splits options on or / versus and keeps mention order", () => {
    const u = parseFarmerText("maize followed by wheat, or rice then cotton, versus paddy after cotton, compared with wheat");
    expect(u.rotations.map((r) => r.name)).toEqual(["Plan 1", "Plan 2", "Plan 3"]);
    expect(u.rotations[0].sequence).toEqual(["maize-grain", "winter-wheat"]);
    expect(u.rotations[1].sequence).toEqual(["rice", "cotton"]);
    expect(u.rotations[2].sequence).toEqual(["rice", "cotton"]);
  });

  it("caps a rotation at 6 crops", () => {
    const u = parseFarmerText("wheat then corn then rice then cotton then wheat then corn then rice, 600 mm");
    expect(u.rotations[0].sequence).toHaveLength(6);
  });

  it("puts unmodelled and non-catalog crops in unmatchedCrops", () => {
    const u = parseFarmerText("almonds then wheat then alfalfa, and chickpeas, 20 inches");
    expect(u.rotations[0].sequence).toEqual(["winter-wheat"]);
    expect(u.unmatchedCrops).toEqual(["almonds", "alfalfa", "chickpeas"]);
  });

  it("maps farmers' words for the added crops to catalog ids", () => {
    const cases: [string, string][] = [
      ["milo", "grain-sorghum"],
      ["sorghum", "grain-sorghum"],
      ["barley", "barley"],
      ["bajra", "millet"],
      ["pearl millet", "millet"],
      ["safflower", "safflower"],
      ["dal", "lentil"],
      ["soybeans", "soybean"],
      ["soy", "soybean"],
      ["peanuts", "groundnut"],
      ["groundnut", "groundnut"],
      ["potatoes", "potato"],
      ["tomatoes", "processing-tomato"],
      ["onions", "onion"],
      ["carrots", "carrot"],
      ["lettuce", "lettuce"],
      ["cantaloupe", "cantaloupe"],
      ["melons", "sweet-melon"],
      ["watermelon", "watermelon"],
      ["sweet corn", "sweet-corn"],
      ["corn", "maize-grain"],
      ["black-eyed peas", "cowpea"],
      ["cowpeas", "cowpea"],
      ["oats", "oats"],
      ["spring wheat", "spring-wheat"],
      ["wheat", "winter-wheat"],
    ];
    for (const [w, id] of cases) expect(cropWordToId(w), w).toEqual({ id });
  });

  it("keeps sweet corn and grain corn apart in a sentence", () => {
    const u = parseFarmerText("sweet corn then corn then watermelon then milo, 600 mm");
    expect(u.rotations[0].sequence).toEqual(["sweet-corn", "maize-grain", "watermelon", "grain-sorghum"]);
    expect(u.unmatchedCrops).toEqual([]);
  });

  it("asks for crops when none can be modelled", () => {
    const u = parseFarmerText("I grow almonds and grapes with 600 mm");
    expect(u.rotations).toEqual([]);
    expect(u.unmatchedCrops).toEqual(["almonds", "grapes"]);
    expect(u.missing[0]).toMatch(/^Which crops do you grow, in order\? We can model: Winter wheat/);
  });

  it("converts supply units", () => {
    expect(parseFarmerText("wheat, 24 inches").supplyMm).toBe(610); // 609.6
    expect(parseFarmerText("wheat, 2 feet of water").supplyMm).toBe(610);
    expect(parseFarmerText("wheat, 650 mm").supplyMm).toBe(650);
    expect(parseFarmerText("wheat, 6 ML per hectare").supplyMm).toBe(600);
    expect(supplyToMm(1, "acre-foot-per-acre")).toBe(305);
  });

  it("reads hectares, $ budgets per acre and megalitre prices", () => {
    const u = parseFarmerText("rice, 50 hectares, $150 per acre, water is $300 per megalitre");
    expect(u.acres).toBe(123.6); // 50 x 2.47105 = 123.55
    expect(u.budget).toEqual({ amount: 150, per: "acre" });
    expect(u.waterPrice).toEqual({ amount: 300, per: "megalitre" });
  });

  it("does not confuse the water price with the budget, and 30k", () => {
    const u = parseFarmerText("cotton, water costs $150 an acre-foot and I have 30k, 100 acres");
    expect(u.waterPrice).toEqual({ amount: 150, per: "acre-foot" });
    expect(u.budget).toEqual({ amount: 30000, per: "total" });
  });

  it("derives supply from budget, price and acres when no supply was said", () => {
    const u = parseFarmerText("wheat then corn, budget $30,000, water $150 per acre-foot, 200 acres");
    // 30000 / 150 = 200 acre-feet; / 200 acres = 1 foot; x 304.8 = 305 mm
    expect(u.supplyMm).toBe(305);
    expect(u.supplyAsSaid).toBe("from your budget: $30000 at $150 per acre-foot over 200 acres");
    expect(u.missing).toEqual([]);
  });

  it("maps priorities in order of mention", () => {
    const u = parseFarmerText("I want variety, a low water bill, to save water and not run out");
    expect(u.priorities).toEqual(["grow-more-crops", "low-water-cost", "use-less-water", "dependable-water"]);
  });

  it("handles empty text", () => {
    const u = parseFarmerText("");
    expect(u.rotations).toEqual([]);
    expect(u.supplyMm).toBeNull();
    expect(u.budget).toBeNull();
    expect(u.priorities).toEqual([]);
    expect(u.missing).toHaveLength(2);
    expect(u.missing[1]).toBe(SUPPLY_QUESTION);
  });
});

describe("helpers", () => {
  it("maps crop words", () => {
    expect(cropWordToId("Grain corn")).toEqual({ id: "maize-grain" });
    expect(cropWordToId("sugar beets")).toEqual({ id: "sugar-beet" });
    expect(cropWordToId("quinoa")).toEqual({ unmatched: "quinoa" });
  });

  it("rejects an invalid supply and asks for it", () => {
    const u = fromMentions({ rotations: [["wheat"]], supply: { value: -3, unit: "mm" }, budget: null, waterPrice: null, area: null, priorities: [] });
    expect(u.supplyMm).toBeNull();
    expect(u.missing).toEqual([SUPPLY_QUESTION]);
  });
});

describe("understandWithModel", () => {
  it("maps model mentions with our own conversions", async () => {
    const { understandWithModel } = await import("./understand");
    const call = async () => ({ text: JSON.stringify({ rotations: [{ crops: ["wheat", "grain corn"] }], supply: { value: 2.5, unit: "acre-foot-per-acre" }, priorities: ["protect-soil-nutrients"] }), model: "m1" });
    const out = await understandWithModel("anything", call);
    expect(out.method).toBe("ai");
    expect(out.understood.supplyMm).toBe(762);
    expect(out.understood.rotations[0].sequence).toEqual(["winter-wheat", "maize-grain"]);
  });

  it("falls back to rules on invalid output or failure", async () => {
    const { understandWithModel } = await import("./understand");
    const bad = await understandWithModel("wheat, 600 mm", async () => ({ text: JSON.stringify({ rotations: [], priorities: [], supplyMm: 999 }) }));
    expect(bad.method).toBe("rules");
    expect(bad.understood.supplyMm).toBe(600);
    const fail = await understandWithModel("wheat", async () => { throw new Error("busy"); });
    expect(fail).toMatchObject({ method: "rules", reason: "busy" });
  });
});
