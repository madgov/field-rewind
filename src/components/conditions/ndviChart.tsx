import { dayNumber, dayOfYear, type NdviIndicators } from "@/lib/ndvi/indicators";
import { ChartScroll, HatchDefs, niceTicks, W } from "./charts";
import { fmtValue } from "./models";

const ML = 48;
const MR = 12;
const MT = 14;
const MB = 28;

type Obs = { date: string; ndvi: number; satellite: string };

/** Every clear observation over time, with yearly peaks, stress flags and bare spells marked in different shapes. */
export function NdviOverview({ id, observations, modis, ind }: { id: string; observations: Obs[]; modis: { date: string; ndvi: number }[] | null; ind: NdviIndicators }) {
  const H = 300;
  const d0 = dayNumber("1985-01-01");
  const d1 = dayNumber("2025-12-31");
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const all = [...observations.map((o) => o.ndvi), ...(modis ?? []).map((o) => o.ndvi)];
  const lo = Math.min(0, ...all);
  const hi = Math.max(1, ...all);
  const x = (iso: string) => ML + ((dayNumber(iso) - d0) / (d1 - d0)) * plotW;
  const y = (v: number) => MT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const ticks = niceTicks(lo, hi, 5);
  const peaks = ind.peaks.filter((p) => p.peak !== null && p.peakDate);
  const sparseYears = ind.peaks.filter((p) => p.sparse && p.peak !== null).length;
  return (
    <ChartScroll label="Chart of every clear satellite observation, 1985 to 2025. Scroll sideways on a small screen.">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="cx-chart cx-chart--ndvi" style={{ minWidth: 600 }}>
        <title id={`${id}-t`}>Vegetation index (NDVI) of the 30 m pixel at the pin, every clear Landsat observation 1985 to 2025</title>
        <desc id={`${id}-d`}>{`${observations.length} clear observations drawn as dots. Yearly peaks are joined by a line, with hollow rings where the year had few clear observations. ${ind.stressFlags.length} stress flags are triangles. ${ind.barePeriods.length} bare spells are hatched bands.${modis ? ` ${modis.length} MODIS 250 m composites are drawn as small crosses.` : ""}`}</desc>
        <HatchDefs id={id} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className="cx-grid" />
            <text x={ML - 6} y={y(t) + 4} textAnchor="end" className="cx-axis">{fmtValue(t, 2)}</text>
          </g>
        ))}
        {ind.barePeriods.map((b, i) => (
          <rect key={i} x={x(b.start)} y={MT} width={Math.max(3, x(b.end) - x(b.start))} height={plotH} fill={`url(#${id}-hatch)`} opacity={0.4}>
            <title>{`Bare spell seen from ${b.start} to ${b.end}: ${b.nObs} clear observations, lowest NDVI ${fmtValue(b.minNdvi, 2)}`}</title>
          </rect>
        ))}
        {modis && (
          <path
            className="cx-modis"
            d={modis.map((o) => `M${(x(o.date) - 2).toFixed(1)} ${y(o.ndvi).toFixed(1)}h4M${x(o.date).toFixed(1)} ${(y(o.ndvi) - 2).toFixed(1)}v4`).join("")}
            fill="none"
          />
        )}
        {observations.map((o, i) => (
          <circle key={i} cx={x(o.date)} cy={y(o.ndvi)} r={1.7} className="cx-dot">
            <title>{`${o.date}: NDVI ${fmtValue(o.ndvi, 2)} (${o.satellite})`}</title>
          </circle>
        ))}
        <polyline className="cx-peakline" fill="none" points={peaks.map((p) => `${x(p.peakDate as string).toFixed(1)},${y(p.peak as number).toFixed(1)}`).join(" ")} />
        {peaks.map((p) => (
          <circle key={p.year} cx={x(p.peakDate as string)} cy={y(p.peak as number)} r={3.4} className={p.sparse ? "cx-peak cx-peak--sparse" : "cx-peak"}>
            <title>{`${p.year}: peak NDVI ${fmtValue(p.peak, 2)} on ${p.peakDate}, from ${p.nObs} clear observations${p.sparse ? " (few, so the real peak may be higher)" : ""}`}</title>
          </circle>
        ))}
        {ind.stressFlags.map((f) => (
          <path key={f.date} d={`M${x(f.date)} ${y(f.ndvi) - 7}l5 9h-10z`} className="cx-stress">
            <title>{`${f.date}: NDVI ${fmtValue(f.ndvi, 2)}, ${fmtValue(f.drop, 2)} below the usual ${fmtValue(f.typical, 2)} for the time of year`}</title>
          </path>
        ))}
        {[1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025].map((yr) => (
          <text key={yr} x={x(`${yr}-01-01`)} y={H - 8} textAnchor="middle" className="cx-axis">{yr}</text>
        ))}
        <text x={12} y={MT + plotH / 2} transform={`rotate(-90 12 ${MT + plotH / 2})`} textAnchor="middle" className="cx-axis cx-axis--title">NDVI</text>
      </svg>
      <ul className="cx-key" aria-label="Chart key">
        <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="3.4" className="cx-dot" /></svg> Clear Landsat observation ({observations.length.toLocaleString("en-US")})</li>
        <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4" className="cx-peak" /></svg> Yearly peak, joined by a line</li>
        {sparseYears > 0 && <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4" className="cx-peak cx-peak--sparse" /></svg> Hollow: year with few clear observations ({sparseYears})</li>}
        <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1l5.5 11h-11z" className="cx-stress" /></svg> Unusually low for the time of year ({ind.stressFlags.length})</li>
        <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect width="14" height="14" fill={`url(#${id}-hatch)`} /></svg> Bare or nearly bare spell ({ind.barePeriods.length})</li>
        {modis && <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10M7 2v10" className="cx-modis" fill="none" /></svg> MODIS 250 m composite ({modis.length.toLocaleString("en-US")})</li>}
      </ul>
    </ChartScroll>
  );
}

const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Green-up date for each year as a dot, with a vertical bar for the days it could be off by. */
export function GreenUpChart({ id, ind }: { id: string; ind: NdviIndicators }) {
  const H = 260;
  const ups = ind.greenUps;
  const first = ups[0]?.year ?? 1985;
  const n = ups.length;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const x = (yr: number) => ML + ((yr - first + 0.5) / n) * plotW;
  const y = (doy: number) => MT + plotH - ((doy - 1) / 365) * plotH;
  const bw = Math.max(2, plotW / n - 2);
  return (
    <ChartScroll label="Chart of the green-up date for each year, with the uncertainty in days. Scroll sideways on a small screen.">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="cx-chart cx-chart--greenup" style={{ minWidth: 520 }}>
        <title id={`${id}-t`}>Estimated green-up date for each year, with the days it could be off by</title>
        <desc id={`${id}-d`}>{`${ups.filter((u) => u.date).length} of ${ups.length} years have a green-up date. Each is a dot with a vertical bar spanning the two clear observations either side of the crossing, so the true date lies somewhere in the bar.`}</desc>
        <HatchDefs id={id} />
        {MONTH_START.map((d, i) => (
          <g key={d}>
            <line x1={ML} x2={W - MR} y1={y(d)} y2={y(d)} className="cx-grid" />
            <text x={ML - 6} y={y(d) + 4} textAnchor="end" className="cx-axis">{MONTH[i]}</text>
          </g>
        ))}
        {ups.map((u) => {
          if (!u.date || !u.bracket) {
            return (
              <rect key={u.year} x={x(u.year) - bw / 2} y={MT} width={bw} height={plotH} fill={`url(#${id}-hatch)`} opacity={0.85}>
                <title>{`${u.year}: no green-up date. ${u.reason ?? ""}`}</title>
              </rect>
            );
          }
          const a = dayOfYear(u.bracket.before);
          const b = dayOfYear(u.bracket.after);
          return (
            <g key={u.year}>
              <line x1={x(u.year)} x2={x(u.year)} y1={y(a)} y2={y(b)} className="cx-err" />
              <line x1={x(u.year) - 3} x2={x(u.year) + 3} y1={y(a)} y2={y(a)} className="cx-err" />
              <line x1={x(u.year) - 3} x2={x(u.year) + 3} y1={y(b)} y2={y(b)} className="cx-err" />
              <circle cx={x(u.year)} cy={y(dayOfYear(u.date))} r={3} className="cx-peak">
                <title>{`${u.year}: green-up around ${u.date}, give or take up to ${u.uncertaintyDays} days (between ${u.bracket.before} and ${u.bracket.after})`}</title>
              </circle>
            </g>
          );
        })}
        {ups.filter((u) => u.year % 5 === 0).map((u) => (
          <text key={u.year} x={x(u.year)} y={H - 8} textAnchor="middle" className="cx-axis">{u.year}</text>
        ))}
      </svg>
      <ul className="cx-key" aria-label="Chart key">
        <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4" className="cx-peak" /></svg> Estimated green-up date</li>
        <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v12M4 1h6M4 13h6" className="cx-err" fill="none" /></svg> Days it could be off by (the true crossing lies in the bar)</li>
        <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect width="14" height="14" fill={`url(#${id}-hatch)`} /></svg> No green-up date for that year</li>
      </ul>
    </ChartScroll>
  );
}
