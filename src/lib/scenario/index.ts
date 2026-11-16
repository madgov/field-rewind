// Stable surface for the UI. No node:fs here: the caller passes the data, so client components can import it.
export { SCENARIO_LABEL, DEFAULT_SCENARIO, DEFAULT_HUMIDITY_MODE, RAIN_FACTOR_RANGE, TEMP_DELTA_RANGE } from "./types";
export type {
  Scenario,
  HumidityMode,
  AppliedScenario,
  ScenarioPower,
  ScenarioReplay,
  ScenarioReplayInput,
  ScenarioShift,
  SweepResult,
  SweepOk,
  SweepPoint,
  SweepRotation,
} from "./types";
export { scenarioPower, validateScenario, isIdentityScenario, rhHoldingVapourPressure } from "./transform";
export { runScenarioReplay, runScenarioShift, scenarioSweep, rainFactorGrid, tempDeltaGrid, sweepRotations } from "./run";
export { scenarioWording, describeScenario, humidityNote } from "./wording";
export type { ScenarioWording } from "./wording";
