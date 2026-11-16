/**
 * What-if transform of a REAL NASA POWER record. Pure, no I/O, browser-safe. See docs/scenario-method.md.
 * Rain is scaled, temperature is shifted, humidity is recomputed so the existing FAO-56 code sees the intended vapour pressure.
 */
import { meanSaturationVapourPressure } from "../et0/fao56";
import type { DailyRecord, PowerResult } from "../types";
import {
  DEFAULT_HUMIDITY_MODE,
  SCENARIO_LABEL,
  type AppliedScenario,
  type HumidityMode,
  type Scenario,
  type ScenarioPower,
} from "./types";

/** Returns a problem description, or null when the scenario is usable. */
export function validateScenario(s: Scenario): string | null {
  if (!Number.isFinite(s.rainFactor) || s.rainFactor < 0) return "The rain multiplier must be a number, 0 or more.";
  if (!Number.isFinite(s.tempDeltaC)) return "The temperature shift must be a number.";
  if (s.humidity !== undefined && s.humidity !== "hold-vapour-pressure" && s.humidity !== "hold-rh") {
    return "The humidity option must be hold-vapour-pressure or hold-rh.";
  }
  return null;
}

export function isIdentityScenario(s: Pick<Scenario, "rainFactor" | "tempDeltaC">): boolean {
  return s.rainFactor === 1 && s.tempDeltaC === 0;
}

/**
 * Relative humidity (percent) that gives the same actual vapour pressure ea after the temperature shift.
 * ea = RH/100 x es(Tmax, Tmin) (FAO-56 Eq. 19, es from Eq. 11 and 12). Returns null when it cannot be computed.
 * `clamped` is true when the result had to be limited to 0-100.
 */
export function rhHoldingVapourPressure(
  rhPct: number,
  tMaxC: number,
  tMinC: number,
  deltaC: number,
): { rhPct: number; clamped: boolean } | null {
  if (!Number.isFinite(rhPct) || rhPct < 0 || rhPct > 100) return null;
  const ea = (rhPct / 100) * meanSaturationVapourPressure(tMaxC, tMinC);
  const esNew = meanSaturationVapourPressure(tMaxC + deltaC, tMinC + deltaC);
  if (!(esNew > 0) || !Number.isFinite(ea)) return null;
  const raw = (ea / esNew) * 100;
  const rh = Math.min(100, Math.max(0, raw));
  return { rhPct: rh, clamped: rh !== raw };
}

/**
 * New PowerResult with the scenario applied. Never mutates the input. Everything except the daily rain, temperature and
 * humidity values (including origin, fetchedAt, sourceUrls, missing counts) is carried over unchanged, so the saved/live
 * label still shows what the underlying data is. At rain 1 and shift 0 the day values are identical to the original.
 */
export function scenarioPower(power: PowerResult, scenario: Scenario): ScenarioPower {
  const problem = validateScenario(scenario);
  if (problem) throw new RangeError(problem);
  const humidity: HumidityMode = scenario.humidity ?? DEFAULT_HUMIDITY_MODE;
  const { rainFactor, tempDeltaC } = scenario;
  const identity = isIdentityScenario(scenario);
  let rhClampedDays = 0;
  let rhNotAdjustedDays = 0;
  let rainDaysScaled = 0;

  const days: DailyRecord[] = power.days.map((d) => {
    if (identity) return { ...d };
    const out: DailyRecord = { ...d };
    if (rainFactor !== 1 && d.precipMm !== null) {
      out.precipMm = d.precipMm * rainFactor;
      rainDaysScaled++;
    }
    if (tempDeltaC !== 0) {
      if (d.tMaxC !== null) out.tMaxC = d.tMaxC + tempDeltaC;
      if (d.tMinC !== null) out.tMinC = d.tMinC + tempDeltaC;
      if (humidity === "hold-vapour-pressure" && d.rhPct !== null) {
        const r =
          d.tMaxC !== null && d.tMinC !== null ? rhHoldingVapourPressure(d.rhPct, d.tMaxC, d.tMinC, tempDeltaC) : null;
        if (r) {
          out.rhPct = r.rhPct;
          if (r.clamped) rhClampedDays++;
        } else {
          rhNotAdjustedDays++;
        }
      }
    }
    return out;
  });

  const applied: AppliedScenario = {
    rainFactor,
    tempDeltaC,
    humidity,
    isIdentity: identity,
    label: SCENARIO_LABEL,
    rhClampedDays,
    rhNotAdjustedDays,
    rainDaysScaled,
  };
  return { ...power, days, scenario: applied };
}
