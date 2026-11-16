import type { Crop } from "../crops/types";
import { replay } from "../replay/replay";
import type { ReplayInput, ReplayOk } from "../replay/types";
import { computeShift } from "../shift/compute";
import type { PowerResult } from "../types";
import { scenarioPower } from "./transform";
import {
  DEFAULT_HUMIDITY_MODE,
  RAIN_FACTOR_RANGE,
  SCENARIO_LABEL,
  TEMP_DELTA_RANGE,
  type HumidityMode,
  type Scenario,
  type ScenarioReplay,
  type ScenarioReplayInput,
  type ScenarioShift,
  type SweepOk,
  type SweepPoint,
  type SweepResult,
  type SweepRotation,
} from "./types";

/** The existing replay, unchanged, run on the transformed real record. */
export function runScenarioReplay(power: PowerResult, crops: Crop[], input: ScenarioReplayInput): ScenarioReplay {
  const sp = scenarioPower(power, input.scenario);
  const replayInput: ReplayInput = { rotations: input.rotations, supplyMm: input.supplyMm };
  return { replay: replay(sp, crops, replayInput), scenario: sp.scenario, label: SCENARIO_LABEL };
}

/** The existing shift computation, unchanged, run on the transformed real record. */
export function runScenarioShift(power: PowerResult, scenario: Scenario): ScenarioShift {
  const sp = scenarioPower(power, scenario);
  return { shift: computeShift(sp), scenario: sp.scenario, label: SCENARIO_LABEL };
}

/** Grid values by integer index so 0.7 + 3 x 0.05 prints as 0.85, not 0.8500000000000001. */
export function rainFactorGrid(): number[] {
  const { min, max, step } = RAIN_FACTOR_RANGE;
  const n = Math.round((max - min) / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round((min + i * step) * 1e6) / 1e6);
}
export function tempDeltaGrid(): number[] {
  const { min, max, step } = TEMP_DELTA_RANGE;
  const n = Math.round((max - min) / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round((min + i * step) * 1e6) / 1e6);
}

export function sweepRotations(r: ReplayOk): SweepRotation[] {
  return r.rotations.map((rot) => {
    const last = rot.decades[rot.decades.length - 1];
    return {
      name: rot.name,
      lastDecadeShort: last.short,
      lastDecadeEvaluable: last.evaluable,
      allShort: rot.totals.short,
      allEvaluable: rot.totals.evaluable,
    };
  });
}

/**
 * Years short for each rotation across a small grid: rain 0.70-1.30 at +0 C, and +-temperature -2..+4 C at rain 1.0.
 * Each point is one full replay on a transformed copy of the real record.
 */
export function scenarioSweep(
  power: PowerResult,
  crops: Crop[],
  input: { rotations: ReplayInput["rotations"]; supplyMm: number; humidity?: HumidityMode },
  now: () => number = () => Date.now(),
): SweepResult {
  const t0 = now();
  const humidity = input.humidity ?? DEFAULT_HUMIDITY_MODE;
  const run = (rainFactor: number, tempDeltaC: number) =>
    runScenarioReplay(power, crops, { rotations: input.rotations, supplyMm: input.supplyMm, scenario: { rainFactor, tempDeltaC, humidity } }).replay;

  const base = run(1, 0);
  if (base.status !== "ok") return { status: "unavailable", reason: base.reason, nextStep: base.nextStep };
  const baseline = sweepRotations(base);

  const point = (axis: SweepPoint["axis"], rainFactor: number, tempDeltaC: number): SweepPoint => {
    if (rainFactor === 1 && tempDeltaC === 0) return { axis, rainFactor, tempDeltaC, rotations: baseline };
    const r = run(rainFactor, tempDeltaC);
    // Same inputs and the same record as the baseline, so this cannot become unavailable.
    return { axis, rainFactor, tempDeltaC, rotations: sweepRotations(r as ReplayOk) };
  };
  const rain = rainFactorGrid().map((f) => point("rain", f, 0));
  const temperature = tempDeltaGrid().map((d) => point("temperature", 1, d));
  const out: SweepOk = {
    status: "ok",
    supplyMm: input.supplyMm,
    humidity,
    baseline,
    rain,
    temperature,
    label: SCENARIO_LABEL,
    elapsedMs: now() - t0,
  };
  return out;
}
