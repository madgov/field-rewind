/** Small wording helpers. All sentences in this module are built from computed numbers with these. */

/** Number to text: finite only, at most `digits` decimals, trailing zeros trimmed. Anything else is "no value" (never "NaN"). */
export function num(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "no value";
  const s = n.toFixed(digits);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function ofTotal(k: number, n: number): string {
  return `${k} of ${n}`;
}

export function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function ordinalPlace(rank: number, of: number): string {
  return `place ${rank} of ${of}`;
}

export const NO_VALUE_TEXT = "no sourced value";
