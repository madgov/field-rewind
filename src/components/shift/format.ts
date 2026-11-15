import { DEMO_PINS } from "@/lib/demoPins";

/** "15 Nov 2026, 06:33 UTC" */
export function formatUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${iso} (unreadable date)`;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(d);
  return `${date}, ${time} UTC`;
}

export const latText = (v: number, dp = 4) => `${Math.abs(v).toFixed(dp)}° ${v >= 0 ? "N" : "S"}`;
export const lonText = (v: number, dp = 4) => `${Math.abs(v).toFixed(dp)}° ${v >= 0 ? "E" : "W"}`;

/** Demo pin name if this point is one of the example places, else null. */
export function demoNameFor(lat: number, lon: number): string | null {
  const d = DEMO_PINS.find((p) => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005);
  return d ? d.name : null;
}
