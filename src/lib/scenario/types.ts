import type { PowerResult } from "../types";
import type { ReplayResult, RotationInput } from "../replay/types";
import type { ShiftResult } from "../shift/types";

/** Constant label every what-if view must show. */
export const SCENARIO_LABEL = "What-if applied to the real 1985-2025 record. Not a forecast.";

/**
 * How relative humidity is handled when temperature is shifted (docs/scenario-method.md).
 * - "hold-vapour-pressure" (default): each day's actual vapour pressure ea stays what the real record implies, so RH falls as air warms.
 * - "hold-rh": RH2M is left as recorded, so ea rises with temperature (more moisture in the air, less extra demand).
 */
export type HumidityMode = "hold-vapour-pressure" | "hold-rh";

export type Scenario = {
  /** Multiplier on every day's rainfall. 1 = as recorded. */
  rainFactor: number;
  /** Degrees C added to every day's T2M_MAX and T2M_MIN. 0 = as recorded. */
  tempDeltaC: number;
  /** Only matters when tempDeltaC is not 0. Default "hold-vapour-pressure". */
  humidity?: HumidityMode;
};

export const DEFAULT_SCENARIO: Required<Scenario> = { rainFactor: 1, tempDeltaC: 0, humidity: "hold-vapour-pressure" };
export const DEFAULT_HUMIDITY_MODE: HumidityMode = "hold-vapour-pressure";

export const RAIN_FACTOR_RANGE = { min: 0.7, max: 1.3, step: 0.05 } as const;
export const TEMP_DELTA_RANGE = { min: -2, max: 4, step: 0.5 } as const;

/** What was actually applied, including counts the UI should show rather than hide. */
export type AppliedScenario = {
  rainFactor: number;
  tempDeltaC: number;
  humidity: HumidityMode;
  /** True when rainFactor is 1 and tempDeltaC is 0: the record is returned unchanged. */
  isIdentity: boolean;
  label: typeof SCENARIO_LABEL;
  /** Days where the recomputed RH had to be limited to the 0-100 range. Those days no longer hold ea exactly. */
  rhClampedDays: number;
  /** Days with a temperature shift where RH could not be recomputed (a temperature or RH value was missing or invalid), so RH was left as recorded. */
  rhNotAdjustedDays: number;
  /** Days whose rainfall was multiplied. */
  rainDaysScaled: number;
};

/** A PowerResult plus the scenario that produced it. Assignable to PowerResult; origin and fetchedAt are the original's. */
export type ScenarioPower = PowerResult & { scenario: AppliedScenario };

export type ScenarioReplayInput = { rotations: RotationInput[]; supplyMm: number; scenario: Scenario };

export type ScenarioReplay = { replay: ReplayResult; scenario: AppliedScenario; label: typeof SCENARIO_LABEL };
export type ScenarioShift = { shift: ShiftResult; scenario: AppliedScenario; label: typeof SCENARIO_LABEL };

export type SweepRotation = {
  name: string;
  /**
   * Years short in 2016-2025, and how many of those 10 seasons could be judged.
   * "Evaluable" = short + ok; seasons with too little data are left out, so it is at most 10
   * (last decade) or 40 (all seasons). Do not confuse it with the short counts, which do vary with the scenario.
   */
  lastDecadeShort: number;
  lastDecadeEvaluable: number;
  /** Years short over all 40 seasons, and how many could be judged. */
  allShort: number;
  allEvaluable: number;
};

export type SweepPoint = {
  axis: "rain" | "temperature";
  rainFactor: number;
  tempDeltaC: number;
  rotations: SweepRotation[];
};

export type SweepOk = {
  status: "ok";
  supplyMm: number;
  humidity: HumidityMode;
  baseline: SweepRotation[];
  rain: SweepPoint[];
  temperature: SweepPoint[];
  label: typeof SCENARIO_LABEL;
  /** Milliseconds the sweep took on this machine (informational). */
  elapsedMs: number;
};
export type SweepResult = SweepOk | { status: "unavailable"; reason: string; nextStep: string };
