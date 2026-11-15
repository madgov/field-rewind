export const MM_PER_INCH = 25.4;

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

function fmt(n: number, digits: number): string {
  const r = Number(n.toFixed(digits));
  return (r === 0 ? 0 : r).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** formatMm(1287) -> "1,287 mm" */
export function formatMm(mm: number): string {
  return `${fmt(mm, 0)} mm`;
}

/** formatInches(1287) takes millimetres -> "50.7 in" */
export function formatInches(mm: number): string {
  return `${fmt(mmToInches(mm), 1)} in`;
}

/** formatTempC(35) -> "35 °C"; formatTempF(35) -> "95 °F" */
export function formatTempC(c: number): string {
  return `${fmt(c, 0)} °C`;
}
export function formatTempF(c: number): string {
  return `${fmt(cToF(c), 0)} °F`;
}

/** formatDays(1) -> "1 day", formatDays(12) -> "12 days" */
export function formatDays(n: number): string {
  const r = Math.round(n);
  return `${fmt(r, 0)} ${r === 1 ? "day" : "days"}`;
}
