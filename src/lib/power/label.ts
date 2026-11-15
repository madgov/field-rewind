/**
 * The ONE provenance wording for NASA POWER data. Every screen (shift, replay chip, printed report, How we know,
 * /dev) and the replay data label use these functions so they cannot disagree.
 *
 * Rule (CLAUDE.md): anything not fetched in this very request is a saved response and says so, with the real
 * fetch date. Only origin "live" may say it was fetched just now.
 */

/** "15 Nov 2026, 06:33 UTC" */
export function formatUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${iso} (unreadable date)`;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(d);
  return `${date}, ${time} UTC`;
}

export type PowerOrigin = { origin: "live" | "cache" | "saved"; fetchedAt: string };

/** "Saved response from 15 Nov 2026, 06:33 UTC." (origins "saved" and "cache"), or "Fetched from NASA POWER just now, ...". */
export function powerOriginLine(power: PowerOrigin): string {
  const when = formatUtc(power.fetchedAt);
  return power.origin === "live" ? `Fetched from NASA POWER just now, ${when}.` : `Saved response from ${when}.`;
}

/** Same wording plus what the data is, for the replay data label. */
export function powerDataLabel(power: PowerOrigin): string {
  return `${powerOriginLine(power).replace(/\.$/, "")} (NASA POWER regional climate, about 50 km grid)`;
}
