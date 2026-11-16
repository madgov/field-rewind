/**
 * What the what-if panel and the AI advisor both read: the as-recorded replay and the scenario replay side by side, per rotation
 * and decade, with the sentences from scenarioWording. Pure and browser-safe (types and a builder; no I/O). The numbers come from the
 * existing replay engine run on a transformed copy of the real record (src/lib/scenario); nothing is recomputed here.
 */
import type { ReplayOk, ReplayResult, RotationResult } from "../replay/types";
import { SCENARIO_LABEL, scenarioWording } from "../scenario";
import type { AppliedScenario, HumidityMode, Scenario, ScenarioReplay } from "../scenario";

export type ScenarioCounts = { short: number; judged: number; notJudged: number; byDecade: { label: string; short: number; judged: number }[] };

export type ScenarioRotationView = {
  name: string;
  cropNames: string[];
  baseline: ScenarioCounts;
  scenario: ScenarioCounts;
  /** Generated only from the counts above (scenarioWording). */
  sentence: string;
};

export type ScenarioView =
  | {
      status: "ok";
      label: typeof SCENARIO_LABEL;
      settings: { rainFactor: number; tempDeltaC: number; humidity: HumidityMode };
      isIdentity: boolean;
      rainDaysScaled: number;
      rhClampedDays: number;
      rhNotAdjustedDays: number;
      supplyMm: number;
      headline: string;
      rotations: ScenarioRotationView[];
      notes: string[];
      /** Honest limits that apply to this setting (cooler end, humidity limited to 100 percent, humidity not adjusted). */
      caveats: string[];
    }
  | { status: "unavailable"; reason: string };

function counts(r: RotationResult): ScenarioCounts {
  return {
    short: r.totals.short,
    judged: r.totals.evaluable,
    notJudged: r.totals.insufficient,
    byDecade: r.decades.map((d) => ({ label: d.label, short: d.short, judged: d.evaluable })),
  };
}

/** Limits that go with a setting. Numbers in them are the run's own counts. */
export function scenarioCaveats(applied: AppliedScenario): string[] {
  const out: string[] = [];
  if (applied.isIdentity) return out;
  if (applied.tempDeltaC < 0)
    out.push(
      "The cooler settings are the least faithful part of this what-if. When air is cooled but its real moisture is kept, relative humidity rises, and on many days it reaches the 100 percent ceiling and is held there, so the moisture is no longer exactly what was recorded.",
    );
  if (applied.rhClampedDays > 0)
    out.push(
      `On ${applied.rhClampedDays} days the recomputed relative humidity had to be held at the 0 to 100 percent limit, so those days do not keep the recorded vapour pressure exactly.`,
    );
  if (applied.rhNotAdjustedDays > 0)
    out.push(`On ${applied.rhNotAdjustedDays} days a temperature or humidity value was missing, so humidity was left as recorded.`);
  out.push("Uniform scaling and shifting are crude: real wetter or drier years change storm size, timing and season length differently, and none of that is modelled.");
  return out;
}

/**
 * `wordingNames` (optional, one per rotation, in order) are the names used inside the generated sentences only. The AI payload
 * passes crop names there because its rotation names are letters; the browser passes nothing and sees the farmer's own names.
 */
export function buildScenarioView(
  baseline: ReplayResult,
  run: ScenarioReplay,
  settings: Scenario,
  wordingNames?: string[],
): ScenarioView {
  if (baseline.status !== "ok") return { status: "unavailable", reason: `${baseline.reason} ${baseline.nextStep}`.trim() };
  if (run.replay.status !== "ok") return { status: "unavailable", reason: `${run.replay.reason} ${run.replay.nextStep}`.trim() };
  const b: ReplayOk = baseline;
  const s: ReplayOk = run.replay;
  const relabel = (r: ReplayOk): ReplayOk =>
    wordingNames && wordingNames.length === r.rotations.length ? { ...r, rotations: r.rotations.map((x, i) => ({ ...x, name: wordingNames[i] })) } : r;
  const w = scenarioWording(relabel(b), relabel(s), settings);
  const applied = run.scenario;
  const rotations: ScenarioRotationView[] = b.rotations.map((rot, i) => ({
    name: rot.name,
    cropNames: rot.cropNames,
    baseline: counts(rot),
    scenario: counts(s.rotations[i]),
    sentence: w?.rotations[i]?.sentence ?? "",
  }));
  return {
    status: "ok",
    label: SCENARIO_LABEL,
    settings: { rainFactor: applied.rainFactor, tempDeltaC: applied.tempDeltaC, humidity: applied.humidity },
    isIdentity: applied.isIdentity,
    rainDaysScaled: applied.rainDaysScaled,
    rhClampedDays: applied.rhClampedDays,
    rhNotAdjustedDays: applied.rhNotAdjustedDays,
    supplyMm: b.supplyMm,
    headline: w?.headline ?? SCENARIO_LABEL,
    rotations,
    notes: w?.notes ?? [],
    caveats: scenarioCaveats(applied),
  };
}
