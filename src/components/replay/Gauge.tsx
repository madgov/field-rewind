import type { SeasonResult } from "@/lib/replay/types";
import { describeSeason } from "@/lib/replay/wording";
import { formatMm, formatTempC, formatTempF } from "@/lib/shift/units";
import { SUPPLY_LINE_PCT, cellKind, formatIsoDate, gaugeShape, mmWithInches, plantedYearBefore } from "./cells";

/**
 * One rotation's water gauge for the selected season. The vessel is the supply (the dashed line); the water is the crop's
 * need beyond rain. Short = the water rises above the line and spills (red, hatched, with the word "short"); grey seasons
 * show their reason instead. The only rule here is the engine's own `outcome`.
 */
export default function Gauge({ name, s }: { name: string; s: SeasonResult }) {
  const kind = cellKind(s);
  const shape = gaugeShape(s);
  const grey = kind === "grey";
  const missingBits: string[] = [];
  if (s.missingEt0Days > 0) missingBits.push(`${s.missingEt0Days} with no crop water demand value`);
  if (s.missingPrecipSeasonDays > 0) missingBits.push(`${s.missingPrecipSeasonDays} with no rain value`);
  if (s.missingTMaxDays > 0) missingBits.push(`${s.missingTMaxDays} with no daily high temperature`);

  const label = grey
    ? `${name}, ${s.year}: not enough data to judge`
    : `${name}, ${s.year}: need ${formatMm(s.needMm ?? 0)} against a supply of ${formatMm(s.supplyMm)}, ${kind === "short" ? "short" : "covered"}`;

  return (
    <figure className={`gauge gauge--${kind}`}>
      <figcaption className="gauge__title">
        <span className="gauge__rot">{name}</span>
        <span className="gauge__crop">{s.cropName}</span>
      </figcaption>
      <div className="gauge__body">
        <div className="gauge__vessel" role="img" aria-label={label}>
          <div className="gauge__tank">
            {!grey && (
              <>
                <div className="gauge__water" style={{ height: `${shape.basePct}%` }} />
                <div className="gauge__over" style={{ height: `${shape.overPct}%`, bottom: `${SUPPLY_LINE_PCT}%` }} />
              </>
            )}
            <div className="gauge__line" style={{ bottom: `${SUPPLY_LINE_PCT}%` }}><span>Supply</span></div>
            {kind === "short" && (
              <div className="gauge__spill" aria-hidden="true"><i /><i /><i /></div>
            )}
          </div>
          {kind === "short" && shape.clipped && <span className="gauge__clip">Off the scale</span>}
        </div>
        <div className="gauge__nums">
          <p className="gauge__badge">
            {kind === "short" && (<><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>Short of water</>)}
            {kind === "ok" && (<><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 6.5 5 9.2 10 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>Supply covers it</>)}
            {kind === "grey" && "Not enough data"}
          </p>
          <p className="gauge__dates">
            {formatIsoDate(s.plantingDate)} to {formatIsoDate(s.endDate)}
            {plantedYearBefore(s) && <span className="gauge__prev"> (planted in {s.plantingDate.slice(0, 4)}, harvested in {s.year})</span>}
          </p>
          {grey ? (
            <p className="gauge__reason">{s.reason}</p>
          ) : (
            <dl className="gauge__list">
              <div><dt>Crop water demand</dt><dd>{mmWithInches(s.etcMm ?? 0)}</dd></div>
              <div><dt>Rain that counted</dt><dd>{mmWithInches(s.effectiveRainMm ?? 0)}</dd></div>
              <div className="gauge__need"><dt>Need beyond rain</dt><dd>{mmWithInches(s.needMm ?? 0)}</dd></div>
              <div><dt>Your supply</dt><dd>{mmWithInches(s.supplyMm)}</dd></div>
            </dl>
          )}
        </div>
      </div>
      {!grey && (
        <p className="gauge__heat">
          Hot days (over {formatTempC(s.heatThresholdC)}, {formatTempF(s.heatThresholdC)}): {s.heatDays ?? 0}. Shown for information only; they do not change the result.
        </p>
      )}
      {missingBits.length > 0 && !grey && (
        <p className="gauge__missing">Days without data this season: {missingBits.join("; ")}. Nothing was filled in.</p>
      )}
      <p className="gauge__caption">{describeSeason(s)}</p>
    </figure>
  );
}
