const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive number of days from a to b (b >= a). */
export function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Split [start, end] into consecutive inclusive ranges of at most maxDays days. */
export function splitDays(start: string, end: string, maxDays: number): { start: string; end: string }[] {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) throw new Error(`Invalid date range ${start}..${end}`);
  if (!Number.isInteger(maxDays) || maxDays < 1) throw new Error(`maxDays must be a positive integer, got ${maxDays}`);
  const out: { start: string; end: string }[] = [];
  let s = start;
  while (s <= end) {
    const e = addDays(s, maxDays - 1);
    const last = e > end ? end : e;
    out.push({ start: s, end: last });
    s = addDays(last, 1);
  }
  return out;
}
