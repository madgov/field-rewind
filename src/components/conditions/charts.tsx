import type { ReactNode } from "react";
import { fmtValue, type YearPoint } from "./models";

/** Shared geometry for the year charts. */
export const W = 560;
const ML = 48;
const MR = 12;
const MT = 14;
const MB = 28;

export function niceTicks(lo: number, hi: number, approx = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / approx;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export function ChartScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cx-chartscroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--hatch-b)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch-a)" strokeWidth="2" />
      </pattern>
    </defs>
  );
}

export function ChartTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="cx-table">
      <summary>Show the numbers as a table</summary>
      <div className="hk-tablewrap">
        <table className="hk-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export type YearBarsProps = {
  id: string;
  title: string;
  desc: string;
  points: YearPoint[];
  unit: string;
  digits: number;
  kind?: "bars" | "anomaly";
  periodMeans?: { early: number | null; late: number | null };
  highlightYear?: number | null;
  weak?: boolean[];
  height?: number;
  tone?: string;
  /** Why a missing year has no bar. */
  gapReason?: string;
  /** Drawing width in SVG units (default 560). Compact charts use a smaller width and set minWidth 0. */
  width?: number;
  minWidth?: number;
  tickEvery?: number;
};

/** Yearly bars with a hatched gap wherever a year has no value (never filled in). */
export function YearBars({ id, title, desc, points, unit, digits, kind = "bars", periodMeans, highlightYear, weak, height = 210, tone = "a", gapReason = "no value for this year", width = W, minWidth = 520, tickEvery = 5 }: YearBarsProps) {
  const W = width;
  const H = height;
  const n = points.length;
  const first = points[0]?.year ?? 0;
  const last = points[n - 1]?.year ?? 0;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
  const maxV = vals.length ? Math.max(...vals) : 1;
  const minV = vals.length ? Math.min(...vals) : 0;
  let lo = 0;
  let hi = maxV > 0 ? maxV * 1.1 : 1;
  if (kind === "anomaly") {
    const m = Math.max(Math.abs(maxV), Math.abs(minV), 1e-6) * 1.15;
    lo = -m;
    hi = m;
  } else if (minV < 0) {
    lo = minV * 1.1;
  }
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const y = (v: number) => MT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const x = (yr: number) => ML + ((yr - first) / n) * plotW;
  const bw = Math.max(1, plotW / n - 1.5);
  const ticks = niceTicks(lo, hi, 4);
  const zeroY = y(0);
  const yearTicks = points.filter((p) => p.year % tickEvery === 0).map((p) => p.year);
  const meanLine = (yrs: [number, number], v: number | null, name: string) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x0 = x(Math.max(yrs[0], first));
    const x1 = x(Math.min(yrs[1], last) + 1);
    return (
      <g key={name}>
        <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} className="cx-mean" />
        <text x={(x0 + x1) / 2} y={Math.max(MT + 10, y(v) - 5)} textAnchor="middle" className="cx-meanlabel">{`${yrs[0]}–${yrs[1]} average ${fmtValue(v, digits)}`}</text>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className={`cx-chart cx-chart--${tone}`} style={{ minWidth: minWidth || undefined }}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      <HatchDefs id={id} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className="cx-grid" />
          <text x={ML - 6} y={y(t) + 4} textAnchor="end" className="cx-axis">{fmtValue(t, digits > 0 && Math.abs(t) < 10 ? digits : 0)}</text>
        </g>
      ))}
      {highlightYear != null && highlightYear >= first && highlightYear <= last && (
        <rect x={x(highlightYear) - 1} y={MT} width={bw + 2} height={plotH} className="cx-highlight" />
      )}
      {points.map((p) => {
        const px = x(p.year);
        if (p.value === null || !Number.isFinite(p.value)) {
          return (
            <rect key={p.year} x={px} y={MT} width={bw} height={plotH} fill={`url(#${id}-hatch)`} opacity={0.85}>
              <title>{`${p.year}: ${gapReason}`}</title>
            </rect>
          );
        }
        const top = Math.min(y(p.value), zeroY);
        const h = Math.max(1, Math.abs(y(p.value) - zeroY));
        const isWeak = weak?.[p.year - first] ?? false;
        return (
          <rect key={p.year} x={px} y={top} width={bw} height={h} className={`cx-bar ${p.value < 0 ? "cx-bar--neg" : ""} ${isWeak ? "cx-bar--weak" : ""}`}>
            <title>{`${p.year}: ${fmtValue(p.value, digits)} ${unit}${isWeak ? " (few clear observations)" : ""}`}</title>
          </rect>
        );
      })}
      <line x1={ML} x2={W - MR} y1={zeroY} y2={zeroY} className="cx-zero" />
      {periodMeans && meanLine([1985, 2004], periodMeans.early, "early")}
      {periodMeans && meanLine([2006, 2025], periodMeans.late, "late")}
      {yearTicks.map((yr) => (
        <text key={yr} x={x(yr) + bw / 2} y={H - 8} textAnchor="middle" className="cx-axis">{yr}</text>
      ))}
      <text x={12} y={MT + plotH / 2} transform={`rotate(-90 12 ${MT + plotH / 2})`} textAnchor="middle" className="cx-axis cx-axis--title">{unit}</text>
    </svg>
  );
}

export type TwoSeries = { year: number; a: number | null; b: number | null };

/** Two yearly lines on one scale. Line A is dashed with triangles, line B is solid with circles, so colour is never the only cue. */
export function TwoLines({ id, title, desc, data, aName, bName, unit }: { id: string; title: string; desc: string; data: TwoSeries[]; aName: string; bName: string; unit: string }) {
  const H = 240;
  const n = data.length;
  const first = data[0]?.year ?? 0;
  const vals = data.flatMap((d) => [d.a, d.b]).filter((v): v is number => v !== null);
  const hi = (vals.length ? Math.max(...vals) : 1) * 1.1;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const x = (yr: number) => ML + ((yr - first + 0.5) / n) * plotW;
  const y = (v: number) => MT + plotH - (v / hi) * plotH;
  const path = (key: "a" | "b") => {
    let d = "";
    let pen = false;
    for (const p of data) {
      const v = p[key];
      if (v === null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(p.year).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const ticks = niceTicks(0, hi, 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="cx-chart cx-chart--lines" style={{ minWidth: 520 }}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className="cx-grid" />
          <text x={ML - 6} y={y(t) + 4} textAnchor="end" className="cx-axis">{fmtValue(t, 0)}</text>
        </g>
      ))}
      <path d={path("a")} className="cx-line cx-line--a" fill="none" />
      <path d={path("b")} className="cx-line cx-line--b" fill="none" />
      {data.map((p) => (
        <g key={p.year}>
          {p.a !== null && <path d={`M${x(p.year)} ${y(p.a) - 4}l3.6 6.4h-7.2z`} className="cx-mk cx-mk--a"><title>{`${p.year}: ${aName} ${fmtValue(p.a, 0)} ${unit}`}</title></path>}
          {p.b !== null && <circle cx={x(p.year)} cy={y(p.b)} r={2.8} className="cx-mk cx-mk--b"><title>{`${p.year}: ${bName} ${fmtValue(p.b, 0)} ${unit}`}</title></circle>}
        </g>
      ))}
      {data.filter((p) => p.year % 5 === 0).map((p) => (
        <text key={p.year} x={x(p.year)} y={H - 8} textAnchor="middle" className="cx-axis">{p.year}</text>
      ))}
      <text x={12} y={MT + plotH / 2} transform={`rotate(-90 12 ${MT + plotH / 2})`} textAnchor="middle" className="cx-axis cx-axis--title">{unit}</text>
    </svg>
  );
}
