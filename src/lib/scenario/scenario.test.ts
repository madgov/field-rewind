import { describe, expect, it } from "vitest";
import { CROP_CATALOG } from "../crops/catalog";
import { actualVapourPressureFromRhMean, et0FromDailyRecord } from "../et0/fao56";
import { loadSavedDemoPin } from "../power";
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "../replay/examples";
import { replay } from "../replay/replay";
import type { ReplayOk } from "../replay/types";
import type { MetricId } from "../shift/types";
import { computeShift } from "../shift/compute";
import type { DailyRecord, PowerResult } from "../types";
import {
  DEFAULT_SCENARIO,
  type Scenario,
  SCENARIO_LABEL,
  rainFactorGrid,
  rhHoldingVapourPressure,
  runScenarioReplay,
  runScenarioShift,
  scenarioPower,
  scenarioSweep,
  scenarioWording,
  tempDeltaGrid,
  validateScenario,
} from "./index";

const rot = EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence }));

function day(p: Partial<DailyRecord> = {}): DailyRecord {
  return { date: "2020-07-01", tMaxC: 30, tMinC: 20, rhPct: 50, wind2mMs: 2, solarMJm2: 25, precipMm: 10, ...p };
}
function fixture(days: DailyRecord[]): PowerResult {
  return {
    status: "ok", lat: 37.9, lon: -121.7,
    gridCell: { key: "k", latCenter: 38, lonCenter: -121.5 }, elevationM: 20,
    units: { tMaxC: "C", tMinC: "C", rhPct: "%", wind2mMs: "m/s", solarMJm2: "MJ", precipMm: "mm" },
    requested: { start: "2020-07-01", end: "2020-07-05" }, coverage: { start: "2020-07-01", end: "2020-07-05" },
    missing: { tMaxC: 0, tMinC: 0, rhPct: 0, wind2mMs: 0, solarMJm2: 0, precipMm: 0, anyField: 0, totalDays: days.length },
    fetchedAt: "2026-11-01T00:00:00Z", sourceUrls: ["u"], origin: "saved", days,
  };
}
const es = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));

describe("transform arithmetic (hand fixtures)", () => {
  it("scales rain, shifts temperature, leaves other fields and nulls alone", () => {
    const p = fixture([day(), day({ precipMm: null, tMinC: null }), day({ precipMm: 0 })]);
    const s = scenarioPower(p, { rainFactor: 0.5, tempDeltaC: 2, humidity: "hold-rh" });
    expect(s.days[0].precipMm).toBe(5);
    expect(s.days[0].tMaxC).toBe(32);
    expect(s.days[0].tMinC).toBe(22);
    expect(s.days[0].rhPct).toBe(50);
    expect(s.days[1].precipMm).toBeNull();
    expect(s.days[1].tMinC).toBeNull();
    expect(s.days[2].precipMm).toBe(0); // no new rain days
    expect(s.days[0].wind2mMs).toBe(2);
    expect(s.days[0].solarMJm2).toBe(25);
    expect(s.scenario.rainDaysScaled).toBe(2);
  });
  it("keeps origin, fetchedAt and the label, and does not mutate the input", () => {
    const p = fixture([day()]);
    const snapshot = JSON.stringify(p);
    const s = scenarioPower(p, { rainFactor: 0.7, tempDeltaC: 3 });
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(s).not.toBe(p);
    expect(s.days).not.toBe(p.days);
    expect(s.origin).toBe("saved");
    expect(s.fetchedAt).toBe(p.fetchedAt);
    expect(s.scenario.label).toBe(SCENARIO_LABEL);
    expect("scenario" in p).toBe(false);
  });
  it("rejects invalid scenarios", () => {
    expect(validateScenario({ rainFactor: -1, tempDeltaC: 0 })).not.toBeNull();
    expect(validateScenario({ rainFactor: 1, tempDeltaC: NaN })).not.toBeNull();
    expect(() => scenarioPower(fixture([day()]), { rainFactor: NaN, tempDeltaC: 0 })).toThrow(RangeError);
    expect(validateScenario(DEFAULT_SCENARIO)).toBeNull();
  });
});

describe("vapour pressure handling", () => {
  it("holds ea within tolerance and matches the hand formula", () => {
    const r = rhHoldingVapourPressure(50, 30, 20, 2)!;
    const expected = (50 / 100) * ((es(30) + es(20)) / 2) / ((es(32) + es(22)) / 2) * 100;
    expect(r.rhPct).toBeCloseTo(expected, 10);
    expect(r.rhPct).toBeLessThan(50);
    expect(r.clamped).toBe(false);
    const eaBefore = actualVapourPressureFromRhMean(30, 20, 50);
    const eaAfter = actualVapourPressureFromRhMean(32, 22, r.rhPct);
    expect(Math.abs(eaAfter - eaBefore)).toBeLessThan(1e-12);
  });
  it("hold-rh leaves RH as recorded, so ea rises", () => {
    const s = scenarioPower(fixture([day()]), { rainFactor: 1, tempDeltaC: 2, humidity: "hold-rh" });
    expect(s.days[0].rhPct).toBe(50);
  });
  it("counts clamped days and keeps RH within 0-100", () => {
    const p = fixture([day({ rhPct: 95 }), day({ rhPct: 20 }), day({ rhPct: null }), day({ rhPct: 95, tMaxC: null })]);
    const s = scenarioPower(p, { rainFactor: 1, tempDeltaC: -8 });
    expect(s.days[0].rhPct).toBe(100);
    expect(s.days[1].rhPct).toBeGreaterThan(20);
    expect(s.days[1].rhPct).toBeLessThanOrEqual(100);
    expect(s.days[2].rhPct).toBeNull();
    expect(s.days[3].rhPct).toBe(95);
    expect(s.scenario.rhClampedDays).toBe(1);
    expect(s.scenario.rhNotAdjustedDays).toBe(1);
    for (const d of s.days) if (d.rhPct !== null) expect(d.rhPct >= 0 && d.rhPct <= 100).toBe(true);
  });
  it("ET0 for a shifted day uses the intended ea", () => {
    const base = day();
    const s = scenarioPower(fixture([base]), { rainFactor: 1, tempDeltaC: 2 });
    const hold = et0FromDailyRecord(s.days[0], 37.9, 20)!;
    const heldRh = et0FromDailyRecord(scenarioPower(fixture([base]), { rainFactor: 1, tempDeltaC: 2, humidity: "hold-rh" }).days[0], 37.9, 20)!;
    expect(hold).toBeGreaterThan(et0FromDailyRecord(base, 37.9, 20)!);
    expect(hold).toBeGreaterThan(heldRh); // falling RH demands more water
  });
});

describe("real Brentwood record", async () => {
  const power = await loadSavedDemoPin("brentwood");
  const crops = CROP_CATALOG.crops;
  /** Late-period mean of each shift metric for a scenario; fails the test if the shift is unavailable or a mean is null. */
  const lateMeans = (scenario: Scenario) => {
    const { shift } = runScenarioShift(power, scenario);
    if (shift.status !== "ok") throw new Error(`shift unavailable: ${shift.reason}`);
    const mean = (id: MetricId) => {
      const m = shift.metrics[id].late.mean;
      if (m === null) throw new Error(`no late-period mean for ${id}`);
      return m;
    };
    return { hotDays: mean("hotDays"), et0: mean("et0"), precip: mean("precip") };
  };
  const byName = (r: ReplayOk, key: "decades" | "totals") =>
    Object.fromEntries(r.rotations.map((x) => [x.name, key === "decades" ? x.decades.map((d) => d.short) : x.totals.short]));
  const run = (rainFactor: number, tempDeltaC: number, humidity?: "hold-rh" | "hold-vapour-pressure") =>
    runScenarioReplay(power, crops, { rotations: rot, supplyMm: EXAMPLE_SUPPLY_MM, scenario: { rainFactor, tempDeltaC, humidity } }).replay as ReplayOk;

  it("identity scenario reproduces the example results exactly", () => {
    const r = run(1, 0);
    expect(byName(r, "decades")).toEqual({
      "Wheat, then maize": [2, 2, 2, 1],
      "Maize, then cotton": [9, 8, 8, 8],
      "Rice, wheat, maize": [6, 4, 4, 6],
    });
    const direct = replay(power, crops, { rotations: rot, supplyMm: EXAMPLE_SUPPLY_MM }) as ReplayOk;
    expect(r.rotations.map((x) => x.seasons.map((s) => [s.needMm, s.etcMm, s.effectiveRainMm]))).toEqual(
      direct.rotations.map((x) => x.seasons.map((s) => [s.needMm, s.etcMm, s.effectiveRainMm])),
    );
    expect(scenarioPower(power, DEFAULT_SCENARIO).days).toEqual(power.days);
    expect(runScenarioShift(power, DEFAULT_SCENARIO).shift).toEqual(computeShift(power));
    expect(r.dataLabel).toBe(direct.dataLabel);
  });

  it("less rain never reduces years short; more rain never raises them", () => {
    const grid = rainFactorGrid();
    const prev: Record<string, number> = {};
    // walk from wettest to driest
    for (const f of [...grid].reverse()) {
      const t = byName(run(f, 0), "totals") as Record<string, number>;
      for (const [k, v] of Object.entries(t)) {
        if (k in prev) expect(v).toBeGreaterThanOrEqual(prev[k]);
        prev[k] = v;
      }
    }
  });

  it("hotter (ea held) never reduces total ET0; hot days never fall", () => {
    const total = (delta: number) => {
      const sp = scenarioPower(power, { rainFactor: 1, tempDeltaC: delta });
      let sum = 0;
      for (const d of sp.days) sum += et0FromDailyRecord(d, power.lat, power.elevationM as number) ?? 0;
      return sum;
    };
    let last = -Infinity;
    for (const d of tempDeltaGrid()) {
      const t = total(d);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
    const hot = (delta: number) => lateMeans({ rainFactor: 1, tempDeltaC: delta }).hotDays;
    expect(hot(2)).toBeGreaterThanOrEqual(hot(0));
    expect(hot(4)).toBeGreaterThanOrEqual(hot(2));
  });

  it("rain scaling changes rain totals proportionally and leaves hot days and ET0 alone", () => {
    const a = lateMeans(DEFAULT_SCENARIO);
    const b = lateMeans({ rainFactor: 0.8, tempDeltaC: 0 });
    expect(b.hotDays).toBe(a.hotDays);
    expect(b.et0).toBe(a.et0);
    expect(b.precip).toBeCloseTo(a.precip * 0.8, 6);
  });

  it("sweep: grid, baseline, consistency with single runs, no NaN, fast", () => {
    const sw = scenarioSweep(power, crops, { rotations: rot, supplyMm: EXAMPLE_SUPPLY_MM });
    expect(sw.status).toBe("ok");
    if (sw.status !== "ok") return;
    expect(sw.rain.map((p) => p.rainFactor)).toEqual(rainFactorGrid());
    expect(sw.temperature.map((p) => p.tempDeltaC)).toEqual(tempDeltaGrid());
    expect(sw.rain).toHaveLength(13);
    expect(sw.temperature).toHaveLength(13);
    expect(sw.baseline.map((r) => r.lastDecadeShort)).toEqual([1, 8, 6]);
    const at = sw.rain.find((p) => p.rainFactor === 0.8)!;
    const single = run(0.8, 0);
    expect(at.rotations.map((r) => r.allShort)).toEqual(single.rotations.map((r) => r.totals.short));
    expect(JSON.stringify(sw)).not.toMatch(/NaN|null/);
    expect(sw.elapsedMs).toBeLessThan(60000);
  });

  it("sweep: a decade never has more than 10 judged seasons, and Brentwood judges all of them", () => {
    const sw = scenarioSweep(power, crops, { rotations: rot, supplyMm: EXAMPLE_SUPPLY_MM });
    if (sw.status !== "ok") throw new Error("sweep unavailable");
    for (const p of [...sw.rain, ...sw.temperature, { rotations: sw.baseline }]) {
      for (const r of p.rotations) {
        expect(r.lastDecadeEvaluable).toBe(10);
        expect(r.allEvaluable).toBe(40);
        expect(r.lastDecadeShort).toBeLessThanOrEqual(r.lastDecadeEvaluable);
        expect(r.allShort).toBeLessThanOrEqual(r.allEvaluable);
      }
    }
  });

  it("wording comes from the numbers, has no NaN, and makes no causal claim", () => {
    const base = run(1, 0);
    const scen = run(0.8, 0);
    const w = scenarioWording(base, scen, { rainFactor: 0.8, tempDeltaC: 0 })!;
    expect(w.rotations).toHaveLength(3);
    const mc = w.rotations.find((r) => r.name === "Maize, then cotton")!.sentence;
    expect(mc).toContain("With 20% less rain on every day of the real record, the maize-then-cotton rotation would have been short of water in");
    expect(mc).toContain(`${scen.rotations[1].totals.short} of ${scen.rotations[1].totals.evaluable} seasons instead of ${base.rotations[1].totals.short}`);
    const all = JSON.stringify(w);
    expect(all).not.toMatch(/NaN|undefined|null|forecast will|climate change|because/);
    expect(w.headline).toContain(SCENARIO_LABEL);
    const same = scenarioWording(base, base, { rainFactor: 1, tempDeltaC: 0 })!;
    expect(same.rotations[0].sentence).toContain("exactly as recorded");
  });

  it("does not mutate the saved record", () => {
    const before = JSON.stringify(power.days.slice(0, 500)) + power.days.length;
    run(0.7, 4);
    expect(JSON.stringify(power.days.slice(0, 500)) + power.days.length).toBe(before);
  });
});
