import { DEMO_PINS } from "@/lib/demoPins";

export { formatUtc, powerOriginLine } from "@/lib/power/label";

export const latText = (v: number, dp = 4) => `${Math.abs(v).toFixed(dp)}° ${v >= 0 ? "N" : "S"}`;
export const lonText = (v: number, dp = 4) => `${Math.abs(v).toFixed(dp)}° ${v >= 0 ? "E" : "W"}`;

/** Demo pin name if this point is one of the example places, else null. */
export function demoNameFor(lat: number, lon: number): string | null {
  const d = DEMO_PINS.find((p) => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005);
  return d ? d.name : null;
}
