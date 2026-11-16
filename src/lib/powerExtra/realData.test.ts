import { describe, expect, it } from "vitest";
import { createPowerService } from "../power/service";
import { computeFrost, computeSkinTemperature, computeSoilWetness, frostWording, loadSavedPowerExtra, skinTemperatureWording, soilWetnessWording } from "./index";
import { POWER_EXTRA_LABEL } from "./constants";
import { powerOriginLine } from "../power/label";

const PINS = ["brentwood", "fresno", "ludhiana"] as const;
const power = createPowerService();

describe.each(PINS)("real saved POWER extra data: %s", (pin) => {
  it("has every day of 1985-2025 with real units and no missing values", async () => {
    const r = await loadSavedPowerExtra(pin);
    expect(r.status).toBe("ok");
    expect(r.origin).toBe("saved");
    expect(r.days).toHaveLength(14975);
    expect(r.days[0].date).toBe("1985-01-01");
    expect(r.days[14974].date).toBe("2025-12-31");
    expect(r.missing.anyField).toBe(0);
    expect(r.units.soilRootWetness).toBe("1");
    expect(r.units.frostFlag).toBe("Days");
    expect(powerOriginLine(r)).toMatch(/^Saved response from \d{1,2} \w{3} \d{4}/);
    for (const d of r.days) {
      for (const v of Object.values(d)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
      expect(d.soilRootWetness).toBeGreaterThanOrEqual(0);
      expect(d.soilRootWetness).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(d.frostFlag);
    }
  });

  it("FROST_DAYS equals T2M_MIN <= 0 from the existing saved data on every day", async () => {
    const [extra, main] = await Promise.all([loadSavedPowerExtra(pin), power.loadSavedDemoPin(pin)]);
    const f = computeFrost(extra, main);
    if (f.status !== "ok") throw new Error("expected ok");
    expect(f.crossCheck?.daysCompared).toBe(14975);
    expect(f.crossCheck?.disagreements).toBe(0);
  });

  it("computes 41 years of every series, with the 2005 gap and no NaN anywhere", async () => {
    const extra = await loadSavedPowerExtra(pin);
    const frost = computeFrost(extra);
    const soil = computeSoilWetness(extra);
    const heat = computeSkinTemperature(extra);
    if (frost.status !== "ok" || soil.status !== "ok" || heat.status !== "ok") throw new Error("expected ok");
    expect(frost.years).toHaveLength(41);
    expect(soil.years).toHaveLength(41);
    expect(frost.years.find((y) => y.year === 2005)?.period).toBe("none");
    expect(frost.frostDays.early.yearsUsed).toBe(20);
    expect(frost.frostDays.late.yearsUsed).toBe(20);
    expect(soil.growingSeasonMean.early.yearsUsed).toBe(20);
    for (const y of soil.years) {
      for (const v of [y.growingSeasonMean, y.anomaly, y.zScore, y.dryDays]) expect(v === null || Number.isFinite(v)).toBe(true);
    }
    const json = JSON.stringify({ frost, soil, heat });
    expect(json).not.toMatch(/NaN|Infinity/);
    const texts = [frostWording(frost), soilWetnessWording(soil), skinTemperatureWording(heat)].flatMap((w) => [w.headline, ...w.lines, w.label]);
    for (const t of texts) {
      expect(t).not.toMatch(/NaN|undefined|null|Infinity|\[object/);
      expect(t.length).toBeGreaterThan(0);
    }
    expect(frostWording(frost).label).toBe(POWER_EXTRA_LABEL);
  });
});
