import type { MetricId, MetricShift } from "@/lib/shift/types";
import { formatDays, formatInches, formatMm } from "@/lib/shift/units";

/** Colour ramps, low value first. Warm = hotter or thirstier, blue = wetter. */
export const RAMPS: Record<MetricId, string[]> = {
  hotDays: ["#fbe6bd", "#f2a65a", "#c9501f", "#7a1d0e"],
  et0: ["#f4eec2", "#dcbf55", "#a97a1c", "#5c3b0a"],
  precip: ["#e8f1f5", "#93c4d8", "#3283b3", "#0b3f78"],
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rampColor(stops: string[], t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** Value text with inches beside millimetres. Display formatting only. */
export function fmtValue(metric: Pick<MetricShift, "unit">, v: number): string {
  if (metric.unit === "days per year") return formatDays(v);
  return `${formatMm(v)} (${formatInches(v)})`;
}

/** Which direction is "pressure" for the field. Used only for styling. */
export type Tone = "pressure" | "relief" | "neutral" | "muted";
export function metricTone(m: Pick<MetricShift, "id" | "verdict">): Tone {
  if (m.verdict === "insufficient-data") return "muted";
  if (m.verdict === "no-clear-change") return "neutral";
  const up = m.verdict === "increase";
  const moreIsPressure = m.id === "hotDays" || m.id === "et0";
  return up === moreIsPressure ? "pressure" : "relief";
}
