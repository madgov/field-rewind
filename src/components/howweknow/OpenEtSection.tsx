import { COMPARISON_CAVEAT } from "@/lib/openet/constants";
import type { MonthlyTable } from "@/lib/replay/monthly";
import { formatUtc } from "../shift/format";
import { ObservedOnlyChart } from "./MonthlyCharts";
import OpenEtReplayCompare from "./OpenEtReplayCompare";
import type { OpenEtPanel } from "./openetData";

/** Mean of OpenET by calendar month, from the observed series only (used where there is no rotation to compare). */
function observedMeans(observed: { month: string; etMm: number | null }[]) {
  return Array.from({ length: 12 }, (_, i) => {
    const xs = observed.filter((o) => o.etMm !== null && Number(o.month.slice(5, 7)) === i + 1).map((o) => o.etMm as number);
    return { calendarMonth: i + 1, meanMm: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, n: xs.length };
  });
}

export default function OpenEtSection({ data, mode, monthlyTable }: { data: OpenEtPanel; mode: "replay" | "shift"; monthlyTable: MonthlyTable | null }) {
  return (
    <section className="hk-block" aria-labelledby="hk-oe-h">
      <h3 id="hk-oe-h" className="hk-h3">Checked against satellite water use: OpenET</h3>
      <p className="hk-plain">
        OpenET estimates how much water the land at your pin really lost to the air each month, from satellite images. We set that beside the water use this app models for your crops.
        The two are not the same kind of number, so treat any gap as a question, not a verdict.
      </p>
      {data.kind === "blocked" ? (
        <div className="hk-card hk-card--wait" role="status">
          <p className="hk-card__title">Not available</p>
          <p>No chart is shown, because the app never draws a comparison without real OpenET data.</p>
          <p><strong>Exact message:</strong> <code>{data.message}</code></p>
          <p><strong>Next step:</strong> {data.nextStep}</p>
          <p className="hk-note">{COMPARISON_CAVEAT}</p>
        </div>
      ) : mode === "replay" && monthlyTable ? (
        <>
          <OpenEtReplayCompare observed={data.observed} table={monthlyTable} savedLabel={data.originLine} />
          <OpenEtFacts data={data} />
        </>
      ) : (
        <div className="hk-result">
          <p className="hk-provline"><strong>OpenET data: {data.originLine}</strong>. Not newly retrieved.</p>
          <p className="hk-compared">This page has no crop rotation to compare with, so only OpenET&rsquo;s own monthly values are shown: the average for each calendar month at your pin. Open the 40-season replay and its &ldquo;How we know&rdquo; panel to see them beside modelled crop water use.</p>
          <ObservedOnlyChart means={observedMeans(data.observed)} id="hk-oe-obs" />
          <OpenEtFacts data={data} />
          <p className="hk-caveat" role="note"><strong>Read this first.</strong> {COMPARISON_CAVEAT}</p>
        </div>
      )}
    </section>
  );
}

function OpenEtFacts({ data }: { data: Extract<OpenEtPanel, { kind: "data" }> }) {
  return (
    <p className="hk-note">
      OpenET months with a value: {data.range.withData} of {data.range.requested}{data.range.first ? `, ${data.range.first} to ${data.range.last}` : ""}. Retrieved {formatUtc(data.fetchedAt)}. Units reported by OpenET: {data.unitsReported ?? "not stated in the response (millimetres were requested)"}.
      {data.provisionalMonths.length > 0 && <> The most recent {data.provisionalMonths.length} months are provisional and can still change.</>}
      {data.notes.map((n) => ` ${n}`).join("")}
    </p>
  );
}
