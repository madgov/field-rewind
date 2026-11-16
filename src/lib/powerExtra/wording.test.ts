import { describe, expect, it } from "vitest";
import { computeFrost } from "./frost";
import { computeSkinTemperature } from "./heat";
import { normalizePowerExtra } from "./normalize";
import { computeSoilWetness } from "./soil";
import { makeExtraRaw } from "./testFixtures";
import { POWER_EXTRA_LABEL, frostWording, powerExtraLabel, skinTemperatureWording, soilWetnessWording } from "./wording";

const build = (value: Parameters<typeof makeExtraRaw>[0]["value"]) =>
  normalizePowerExtra({ lat: 37.93, lon: -121.66, responses: [makeExtraRaw({ start: "1985-01-01", end: "2025-12-31", value })], fetchedAt: "2026-01-01T00:00:00.000Z", sourceUrls: [], origin: "saved" });
const janFrost = (n: (y: number) => number) => (p: string, d: string) => (p === "FROST_DAYS" ? (Number(d.slice(5, 7)) === 1 && Number(d.slice(8)) <= n(Number(d.slice(0, 4))) ? 1 : 0) : undefined);

describe("wording", () => {
  it("exports the label exactly", () => {
    expect(POWER_EXTRA_LABEL).toBe("regional climate, about 50 km grid");
    expect(powerExtraLabel()).toBe(POWER_EXTRA_LABEL);
  });

  it("clear fall in frost days is generated from the numbers", () => {
    const w = frostWording(computeFrost(build(janFrost((y) => (y <= 2004 ? 11 : 6)))));
    expect(w.headline).toBe("Frost days at this spot fell from 11 a year to 6 a year between 1985–2004 and 2006–2025.");
    expect(w.label).toBe(POWER_EXTRA_LABEL);
    expect(w.headline).not.toMatch(/[+-]\d/);
  });

  it("clear rise uses 'rose'", () => {
    expect(frostWording(computeFrost(build(janFrost((y) => (y <= 2004 ? 3 : 9))))).headline).toBe("Frost days at this spot rose from 3 a year to 9 a year between 1985–2004 and 2006–2025.");
  });

  it("no change says so, and never claims a change that rounds to nothing", () => {
    const same = frostWording(computeFrost(build(janFrost(() => 8))));
    expect(same.headline).toMatch(/^No clear change in frost days: 8 a year in 1985–2004 and 8 a year in 2006–2025/);
    const tiny = frostWording(computeFrost(build(janFrost((y) => (y <= 2004 ? 8 : y % 20 === 0 ? 9 : 8)))));
    expect(tiny.headline).toMatch(/^No clear change/);
  });

  it("states there is not enough data instead of guessing", () => {
    const sparse = build((p, d) => (p === "FROST_DAYS" && Number(d.slice(0, 4)) <= 1999 && d.slice(5, 7) === "02" ? -999 : p === "FROST_DAYS" && Number(d.slice(0, 4)) <= 1999 ? undefined : undefined));
    // 1985-1999 each miss 28-29 days -> flagged -> only 5 usable early years
    const w = frostWording(computeFrost(sparse));
    expect(w.headline).toMatch(/^Not enough complete data to compare frost days/);
    expect(w.headline).toMatch(/5 usable years in the first period/);
  });

  it("soil wording carries the modelled-not-measured note and the relative-threshold note", () => {
    const soil = computeSoilWetness(build((p, d) => (p === "GWETROOT" ? (Number(d.slice(5, 7)) >= 4 && Number(d.slice(5, 7)) <= 9 ? (Number(d.slice(0, 4)) <= 2004 ? 0.4 : 0.5) : 0.9) : undefined)));
    const w = soilWetnessWording(soil);
    expect(w.headline).toBe("Modelled growing-season (April to September) root-zone soil wetness rose from 0.40 to 0.50 between 1985–2004 and 2006–2025.");
    const text = [w.headline, ...w.lines].join(" ");
    expect(text).toMatch(/modelled/);
    expect(text).toMatch(/not measured in a field/);
    expect(text).toMatch(/not a crop wilting point/);
    expect(text).not.toMatch(/NaN|undefined|null|Infinity/);
  });

  it("makes no causal claims", () => {
    const text = [frostWording(computeFrost(build(janFrost(() => 5)))).headline, soilWetnessWording(computeSoilWetness(build(undefined))).headline].join(" ");
    expect(text).not.toMatch(/because|due to|caused|climate change|global warming/i);
  });

  it("skin temperature wording", () => {
    const w = skinTemperatureWording(computeSkinTemperature(build((p, d) => (p === "TS" ? (Number(d.slice(0, 4)) <= 2004 ? 15 : 17) : undefined))));
    expect(w.headline).toBe("The yearly average ground-surface temperature rose from 15.0 °C to 17.0 °C between 1985–2004 and 2006–2025.");
  });

  it("unavailable results become a plain sentence", () => {
    const err = normalizePowerExtra({ lat: 1, lon: 1, responses: [], fetchedAt: "x", sourceUrls: [], origin: "live" });
    expect(frostWording(computeFrost(err)).headline).toMatch(/^Frost history is not available:/);
    expect(soilWetnessWording(computeSoilWetness(err)).headline).toMatch(/^Soil wetness history is not available:/);
  });
});
