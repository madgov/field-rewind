import { HEAT_THRESHOLD_UNKNOWN_TEXT } from "@/lib/crops/heat";
import type { Crop, Sourced } from "@/lib/crops/types";

export type ExcludedCrop = {
  id: string;
  name: string;
  reason: string;
  fields: { label: string; source: string; page: string; url: string | null; note: string | null }[];
};

function rows(c: Crop): { label: string; unit: string; f: Sourced<number | string> }[] {
  return [
    { label: "Crop factor (Kc), initial stage", unit: "", f: c.kc.ini },
    { label: "Crop factor (Kc), mid-season", unit: "", f: c.kc.mid },
    { label: "Crop factor (Kc), end of season", unit: "", f: c.kc.end },
    { label: "Initial stage length", unit: " days", f: c.stageDays.ini },
    { label: "Development stage length", unit: " days", f: c.stageDays.dev },
    { label: "Mid-season length", unit: " days", f: c.stageDays.mid },
    { label: "Late-season length", unit: " days", f: c.stageDays.late },
    { label: "Planting window starts", unit: "", f: c.planting.windowStart },
    { label: "Planting window ends", unit: "", f: c.planting.windowEnd },
    { label: "Planting date used in the replay", unit: "", f: c.planting.defaultDate },
    { label: "Heat threshold (daily high)", unit: " °C", f: c.heatThresholdC },
  ];
}

function Cite({ f }: { f: { source: string; page: string; url?: string | null; note?: string | null } }) {
  return (
    <>
      <span className="src__source">{f.source}</span>
      {f.page.trim().toLowerCase() !== "n/a" && <span className="src__page">{f.page}</span>}
      {f.url && <a className="src__link" href={f.url} rel="noreferrer">{f.url}</a>}
      {f.note && <span className="src__note">Note: {f.note}</span>}
    </>
  );
}

export default function CropSources({ crops, excluded, compiledOn }: { crops: Crop[]; excluded: ExcludedCrop[]; compiledOn: string }) {
  return (
    <div className="srcs">
      <p className="srcs__intro">Every number about a crop comes from a cited source. Catalog compiled {compiledOn}.</p>
      {crops.map((c) => (
        <details key={c.id} className="disc">
          <summary>Sources for {c.name}</summary>
          <ul className="src">
            {rows(c).map((r) => (
              <li key={r.label} className="src__row">
                <span className="src__label">{r.label}</span>
                <strong className="src__val">{r.f.value === null || r.f.value === undefined ? (r.f === c.heatThresholdC ? HEAT_THRESHOLD_UNKNOWN_TEXT : "unknown (no sourced value)") : `${String(r.f.value)}${r.unit}`}</strong>
                <Cite f={r.f} />
              </li>
            ))}
          </ul>
          <p className="src__flag">{c.spansNewYear ? `${c.name} is planted in one calendar year and harvested in the next; the dates are derived from the planting date and stage lengths.` : `${c.name} is planted and harvested in the same calendar year.`}</p>
        </details>
      ))}
      {excluded.length > 0 && (
        <details className="disc disc--muted">
          <summary>Crops left out ({excluded.length})</summary>
          <p className="srcs__intro">A crop is left out when any value it needs has no source. The app does not guess.</p>
          <ul className="src src--ex">
            {excluded.map((e) => (
              <li key={e.id} className="ex">
                <strong>{e.name}</strong>
                <span className="ex__reason">Left out because {stripName(e.reason, e.name)}</span>
                {e.fields.map((f) => (
                  <span key={f.label} className="ex__field"><em>{f.label}:</em> <Cite f={f} /></span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** The engine's reason is "<Crop> has no sourced value for: ...". Drop the crop name so it reads "left out because no sourced value for ...". */
function stripName(reason: string, name: string): string {
  const r = reason.startsWith(name) ? reason.slice(name.length).trim() : reason;
  return r.replace(/^has no sourced value for:/, "no sourced value for");
}
