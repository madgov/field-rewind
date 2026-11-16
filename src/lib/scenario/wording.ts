/** Plain-English what-if wording, generated only from computed numbers. No causes, no forecast, no climate-change claim. */
import type { ReplayOk } from "../replay/types";
import { SCENARIO_LABEL, type HumidityMode, type Scenario } from "./types";

function num(x: number): string {
  if (!Number.isFinite(x)) return "an unknown amount";
  return String(Math.round(x * 100) / 100);
}

/** e.g. "20% less rain and 2 degrees C hotter on every day of the real record". Empty-change scenarios say so. */
export function describeScenario(s: Pick<Scenario, "rainFactor" | "tempDeltaC">): string {
  const parts: string[] = [];
  const pct = Math.round(Math.abs(s.rainFactor - 1) * 1000) / 10;
  if (s.rainFactor < 1 && pct > 0) parts.push(`${num(pct)}% less rain`);
  else if (s.rainFactor > 1 && pct > 0) parts.push(`${num(pct)}% more rain`);
  const t = Math.round(Math.abs(s.tempDeltaC) * 100) / 100;
  if (s.tempDeltaC > 0 && t > 0) parts.push(`${num(t)} °C hotter`);
  else if (s.tempDeltaC < 0 && t > 0) parts.push(`${num(t)} °C cooler`);
  if (!parts.length) return "With the real record exactly as recorded";
  return `With ${parts.join(" and ")} on every day of the real record`;
}

export function humidityNote(mode: HumidityMode, tempDeltaC: number): string | null {
  if (tempDeltaC === 0) return null;
  return mode === "hold-vapour-pressure"
    ? "Humidity: each day's real actual vapour pressure is kept, so relative humidity falls as the air warms."
    : "Humidity: relative humidity is kept as recorded, so the air holds more moisture as it warms.";
}

function seasons(short: number, evaluable: number): string {
  return `${short} of ${evaluable} seasons`;
}

export type ScenarioWording = {
  label: typeof SCENARIO_LABEL;
  headline: string;
  rotations: { name: string; sentence: string }[];
  notes: string[];
};

/** Compares a scenario replay with the as-recorded replay (same rotations, same supply). Returns null if the pairs do not match. */
export function scenarioWording(baseline: ReplayOk, scenario: ReplayOk, applied: Scenario): ScenarioWording | null {
  if (baseline.rotations.length !== scenario.rotations.length) return null;
  const intro = describeScenario(applied);
  const rotations: { name: string; sentence: string }[] = [];
  for (let i = 0; i < baseline.rotations.length; i++) {
    const b = baseline.rotations[i];
    const s = scenario.rotations[i];
    if (b.name !== s.name) return null;
    const lower = b.name.charAt(0).toLowerCase() + b.name.slice(1);
    const name = lower.replace(/, then /g, "-then-").replace(/,\s*/g, "-");
    const bT = b.totals;
    const sT = s.totals;
    let sentence: string;
    if (applied.rainFactor === 1 && applied.tempDeltaC === 0) {
      sentence = `${intro}, the ${name} rotation was short of water in ${seasons(bT.short, bT.evaluable)}.`;
    } else if (bT.evaluable === sT.evaluable && bT.short === sT.short) {
      sentence = `${intro}, the ${name} rotation would have been short of water in the same ${seasons(sT.short, sT.evaluable)} as recorded.`;
    } else if (bT.evaluable === sT.evaluable) {
      sentence = `${intro}, the ${name} rotation would have been short of water in ${seasons(sT.short, sT.evaluable)} instead of ${bT.short}.`;
    } else {
      sentence = `${intro}, the ${name} rotation would have been short of water in ${seasons(sT.short, sT.evaluable)}, against ${seasons(bT.short, bT.evaluable)} as recorded (a different number of seasons could be judged).`;
    }
    rotations.push({ name: b.name, sentence });
  }
  const notes = [
    "Every storm keeps its real date; only the amounts are scaled. No new rain days are created.",
    "It is a sensitivity test on past weather, not a forecast and not a measurement.",
  ];
  const humidity = humidityNote((applied.humidity ?? "hold-vapour-pressure") as HumidityMode, applied.tempDeltaC);
  if (humidity) notes.push(humidity);
  return { label: SCENARIO_LABEL, headline: `${intro}. ${SCENARIO_LABEL}`, rotations, notes };
}
