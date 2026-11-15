/**
 * Calendar helpers. Everything works on integer "day numbers" (days since 1970-01-01, UTC),
 * so there is no timezone or daylight-saving drift anywhere in the replay.
 */

const DAY_MS = 86_400_000;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Day number of a calendar date (month is 1-12). */
export function dayNum(year: number, month1: number, day: number): number {
  return Math.round(Date.UTC(year, month1 - 1, day) / DAY_MS);
}

export function isoToDayNum(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return dayNum(y, m, d);
}

export function dayNumToIso(n: number): string {
  const dt = new Date(n * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function yearOfDayNum(n: number): number {
  return new Date(n * DAY_MS).getUTCFullYear();
}

/** Month key y*12 + (m-1) for a day number. */
export function monthKeyOfDayNum(n: number): number {
  const dt = new Date(n * DAY_MS);
  return dt.getUTCFullYear() * 12 + dt.getUTCMonth();
}

/** Parses "MM-DD". Returns null when it is not a real calendar day (29 Feb is accepted here; see season.ts). */
export function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(2000, month)) return null; // 2000 is a leap year: 02-29 is allowed here
  return { month, day };
}
