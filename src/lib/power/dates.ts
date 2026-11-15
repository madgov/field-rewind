/** Date helpers. All dates are ISO "YYYY-MM-DD" strings, computed in UTC. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === s;
}

export const toCompact = (iso: string): string => iso.replaceAll("-", "");
export const fromCompact = (c: string): string => `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`;

/** Every calendar day from start to end inclusive, in order. */
export function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  const endMs = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= endMs; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Split [start, end] into calendar-year-aligned chunks of at most `maxYears` years, in order. */
export function splitDateRange(start: string, end: string, maxYears: number): { start: string; end: string }[] {
  if (!Number.isInteger(maxYears) || maxYears < 1) throw new RangeError("maxYears must be a positive integer");
  if (start > end) return [];
  const chunks: { start: string; end: string }[] = [];
  let cur = start;
  while (cur <= end) {
    const lastYear = Number(cur.slice(0, 4)) + maxYears - 1;
    const chunkEnd = `${String(lastYear).padStart(4, "0")}-12-31`;
    const e = chunkEnd < end ? chunkEnd : end;
    chunks.push({ start: cur, end: e });
    cur = `${String(lastYear + 1).padStart(4, "0")}-01-01`;
  }
  return chunks;
}
