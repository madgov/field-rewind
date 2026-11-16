import type { PairStats } from "./types";

export function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Pearson correlation; null for fewer than 2 points or zero variance in either series. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Compare `other` (POWER or a gauge-vs-product pair) with `ref` (Daymet). bias = other minus ref. n must be > 0. */
export function pairStats(ref: readonly number[], other: readonly number[]): PairStats {
  const n = ref.length;
  const meanRef = mean(ref);
  const meanOther = mean(other);
  let se = 0;
  for (let i = 0; i < n; i++) se += ((other[i] as number) - (ref[i] as number)) ** 2;
  const r = pearson(ref, other);
  return { n, meanDaymet: meanRef, meanPower: meanOther, bias: meanOther - meanRef, rmse: Math.sqrt(se / n), r, r2: r === null ? null : r * r };
}
