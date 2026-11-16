"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { Crop } from "@/lib/crops/types";
import { expertiseFor, EXPERTISE_LABEL } from "@/lib/expertise";
import { PRIORITIES, budgetToSupplyMm, viewPriorities, yieldPerAcre } from "@/lib/farmer";
import type { PriorityId, PriorityView } from "@/lib/farmer";
import { NUTRIENT_KEYS, NUTRIENT_LABEL, getNutrients } from "@/lib/nutrients";
import type { ReplayOk } from "@/lib/replay/types";
import { compareRotations, SOILHEALTH_LABEL } from "@/lib/soilhealth";
import type { RotationNutrientResult, WaterFigure } from "@/lib/soilhealth";
import type { AdvisorOutcome } from "@/lib/advisor/run";
import { isIdentityScenario } from "@/lib/scenario";
import type { Scenario } from "@/lib/scenario";

type Units = "us" | "metric";
type Rot = { name: string; sequence: string[] };

type Props = {
  lat: number;
  lon: number;
  exampleFarm: boolean;
  /** Demo pin id when this spot is one of the three saved places, else null. */
  pinId: string | null;
  crops: Crop[];
  rotations: Rot[];
  supplyMm: number;
  supplyMaxMm: number;
  onApplySupply: (mm: number) => void;
  result: ReplayOk | null;
  /** What-if settings from the sliders. Sent only when not neutral; the server reruns them. */
  scenario?: Scenario;
};

const fmt = (v: number | null, dp = 1): string => (v === null ? "unknown" : v.toLocaleString("en-US", { maximumFractionDigits: dp }));

export default function FieldAdvisor(props: Props) {
  const uid = useId();
  const [units, setUnits] = useState<Units>("us");
  const [budget, setBudget] = useState("");
  const [price, setPrice] = useState("");
  const [area, setArea] = useState("");
  const [currency, setCurrency] = useState("");
  const [yieldText, setYieldText] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<PriorityId[]>([]);
  const [applied, setApplied] = useState<string | null>(null);

  // ---- Budget to mm (arithmetic only; money never leaves the browser)
  const budgetOut = useMemo(() => {
    if (budget.trim() === "" && price.trim() === "" && area.trim() === "") return null;
    return budgetToSupplyMm({ units, budget: Number(budget), waterPrice: Number(price), area: Number(area), currencyLabel: currency });
  }, [units, budget, price, area, currency]);
  const priceForCost = useMemo(() => (Number(price) > 0 && Number.isFinite(Number(price)) ? { units, waterPrice: Number(price) } : undefined), [units, price]);

  const applyBudget = () => {
    if (!budgetOut || budgetOut.status !== "ok") return;
    const mm = Math.round(budgetOut.supplyMm);
    const clamped = Math.min(mm, props.supplyMaxMm);
    props.onApplySupply(clamped);
    setApplied(
      mm > props.supplyMaxMm
        ? `Your budget buys ${mm} mm, more than this page's slider goes to, so the supply was set to ${clamped} mm (the slider's top).`
        : `Water supply set to ${clamped} mm.`,
    );
  };

  // ---- Yields (per acre, in each crop's own unit) and the computed comparison
  const usedCropIds = useMemo(() => Array.from(new Set(props.rotations.flatMap((r) => r.sequence))), [props.rotations]);
  const yields = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of usedCropIds) {
      const t = yieldText[id];
      if (t === undefined || t.trim() === "") continue;
      const v = yieldPerAcre(Number(t), units);
      if (v !== null) out[id] = v;
    }
    return out;
  }, [usedCropIds, yieldText, units]);

  const water = useMemo(() => {
    const m: Record<string, WaterFigure> = {};
    if (props.result) for (const r of props.result.rotations) m[r.name] = { short: r.totals.short, evaluable: r.totals.evaluable, supplyMm: props.result.supplyMm };
    return m;
  }, [props.result]);
  const comparison = useMemo(() => compareRotations(props.rotations, yields, water), [props.rotations, yields, water]);
  const views: PriorityView[] = useMemo(
    () => (props.result ? viewPriorities({ order, rotations: props.result.rotations, nutrients: comparison.rotations, price: priceForCost }) : []),
    [props.result, order, comparison, priceForCost],
  );
  const expertise = useMemo(() => expertiseFor(props.pinId, usedCropIds), [props.pinId, usedCropIds]);
  const cropName = (id: string) => props.crops.find((c) => c.id === id)?.name ?? id;

  // ---- Priorities list
  const toggle = (p: PriorityId) => setOrder((o) => (o.includes(p) ? o.filter((x) => x !== p) : [...o, p]));
  const move = (p: PriorityId, d: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(p);
      const j = i + d;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  // ---- AI summary
  const [ai, setAi] = useState<{ state: "idle" | "loading" | "done"; outcome?: AdvisorOutcome; sentKey?: string; failure?: string }>({ state: "idle" });
  const abort = useRef<AbortController | null>(null);
  const requestBody = useMemo(
    () => ({
      lat: props.lat,
      lon: props.lon,
      exampleFarm: props.exampleFarm,
      rotations: props.rotations,
      supplyMm: props.supplyMm,
      yields,
      priorities: order,
      price: priceForCost,
      scenario: props.scenario && !isIdentityScenario(props.scenario) ? props.scenario : undefined,
    }),
    [props.lat, props.lon, props.exampleFarm, props.rotations, props.supplyMm, yields, order, priceForCost, props.scenario],
  );
  const bodyKey = JSON.stringify(requestBody);
  const stale = ai.state === "done" && ai.sentKey !== bodyKey;

  const ask = async () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setAi({ state: "loading" });
    try {
      const res = await fetch("/api/advisor", { method: "POST", headers: { "content-type": "application/json" }, body: bodyKey, signal: ctl.signal });
      const json = (await res.json()) as AdvisorOutcome | { status: "error"; kind: string; message: string };
      setAi({ state: "done", outcome: json as AdvisorOutcome, sentKey: bodyKey });
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      setAi({ state: "done", failure: "The request did not complete. Check your connection and try again.", sentKey: bodyKey });
    }
  };

  const hasRotations = props.rotations.length > 0 && props.result !== null;

  return (
    <section aria-labelledby="fa-h" className="rp-sec fa" data-testid="field-advisor">
      <h2 id="fa-h" className="sh-h2"><span className="rp-step">5</span> Your water budget, yields and priorities</h2>
      <p className="sh-lede">
        Tell us what you can spend on water, what you expect to harvest and what matters most. Everything below is worked out from published figures and the weather record on this page. Nothing here is a forecast.
      </p>

      <div className="fa__units" role="group" aria-label="Units">
        <span className="fa__units-l">Units</span>
        {(["us", "metric"] as const).map((u) => (
          <button key={u} type="button" className={`fa__chip ${units === u ? "fa__chip--on" : ""}`} aria-pressed={units === u} onClick={() => setUnits(u)}>
            {u === "us" ? "US (acres, acre-feet)" : "Metric (hectares, cubic metres)"}
          </button>
        ))}
      </div>

      {/* ---- Budget */}
      <div className="fa__card">
        <h3 className="rp-sub">Water budget (optional)</h3>
        <p className="fa__hint">Turn what you can spend on irrigation water into millimetres of water per season. The amounts stay in your browser and are never sent anywhere.</p>
        <div className="fa__grid">
          <label className="fa__f"><span>Money for water, one season</span><input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} aria-describedby={`${uid}-b`} /></label>
          <label className="fa__f"><span>Price of water, per {units === "us" ? "acre-foot" : "cubic metre"}</span><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <label className="fa__f"><span>Field size, {units === "us" ? "acres" : "hectares"}</span><input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} /></label>
          <label className="fa__f"><span>Currency label (optional)</span><input value={currency} maxLength={6} onChange={(e) => setCurrency(e.target.value)} placeholder="$" /></label>
        </div>
        <p id={`${uid}-b`} className="fa__hint">Use the same currency for money and price. No exchange rate is applied.</p>
        {budgetOut?.status === "invalid" && <ul className="rb__problems" role="status">{budgetOut.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {budgetOut?.status === "ok" && (
          <div className="fa__result" role="status">
            <ol className="fa__steps">{budgetOut.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <button type="button" className="btn btn--primary btn--small" onClick={applyBudget}>Use {Math.round(budgetOut.supplyMm)} mm as my water supply</button>
            {applied && <p className="fa__hint" role="status">{applied}</p>}
          </div>
        )}
      </div>

      {/* ---- Yields */}
      <div className="fa__card">
        <h3 className="rp-sub">Your yield assumptions (optional)</h3>
        <p className="fa__hint">Enter yields from your records or assumptions, per {units === "us" ? "acre" : "hectare"}, in the unit shown. The app does not predict yields or reduce them when water is short. These inputs are used to estimate nutrient removal; they do not change the water replay. Leave a crop blank and its nutrients stay unknown.</p>
        <div className="fa__grid">
          {usedCropIds.map((id) => {
            const n = getNutrients(id);
            return (
              <label className="fa__f" key={id}>
                <span>{cropName(id)}: {n ? n.yieldUnit : "yield"} per {units === "us" ? "acre" : "hectare"}</span>
                <input inputMode="decimal" value={yieldText[id] ?? ""} onChange={(e) => setYieldText((y) => ({ ...y, [id]: e.target.value }))} />
                {n && <small>{n.yieldUnitNote}</small>}
              </label>
            );
          })}
        </div>
      </div>

      {/* ---- Priorities */}
      <div className="fa__card">
        <h3 className="rp-sub">What matters most to you</h3>
        <p className="fa__hint">Tick what you care about and put them in order. We lay each one out side by side. We do not blend them into one score.</p>
        <ul className="fa__prios">
          {(Object.keys(PRIORITIES) as PriorityId[]).map((p) => {
            const i = order.indexOf(p);
            return (
              <li key={p} className="fa__prio">
                <label>
                  <input type="checkbox" checked={i >= 0} onChange={() => toggle(p)} /> <strong>{PRIORITIES[p].label}</strong>
                  <span className="fa__hint"> {PRIORITIES[p].plain}</span>
                </label>
                {i >= 0 && (
                  <span className="fa__order">
                    <span>No. {i + 1}</span>
                    <button type="button" className="fa__mv" onClick={() => move(p, -1)} disabled={i === 0} aria-label={`Move ${PRIORITIES[p].label} up`}>↑</button>
                    <button type="button" className="fa__mv" onClick={() => move(p, 1)} disabled={i === order.length - 1} aria-label={`Move ${PRIORITIES[p].label} down`}>↓</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {!hasRotations ? (
        <p className="rp-empty" role="status">The comparison appears once the replay can run with the rotations above.</p>
      ) : (
        <>
          {/* ---- Priorities table */}
          {views.length > 0 && (
            <div className="fa__card" data-testid="fa-priorities">
              <h3 className="rp-sub">Your priorities, side by side</h3>
              <p className="fa__hint">Water figures come from the replay of the real 1986 to 2025 weather record: regional climate, about 50 km grid, reanalysis and not a farm sensor.</p>
              {views.map((v) => (
                <div key={v.priority} className="fa__prio-view">
                  <h4>{v.rank}. {v.label}</h4>
                  <table className="fa__table">
                    <caption className="sr-only">{v.metricLabel} ({v.unit}) for each rotation</caption>
                    <thead><tr><th scope="col">Rotation</th><th scope="col">{v.metricLabel} ({v.unit})</th></tr></thead>
                    <tbody>
                      {v.rows.map((r) => (
                        <tr key={r.rotation} className={v.best.includes(r.rotation) ? "fa__best" : ""}>
                          <th scope="row">{r.rotation}</th>
                          <td>{fmt(r.value, 2)}{r.note ? <small> {r.note}</small> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="fa__hint">{v.comparable ? `Best on this: ${v.best.join(" and ")}${v.best.length > 1 ? " (tied)" : ""}.` : "No rotation is named best: at least one figure is unknown."}</p>
                </div>
              ))}
            </div>
          )}

          {/* ---- Nutrients */}
          <div className="fa__card" data-testid="fa-nutrients">
            <h3 className="rp-sub">Nutrients carried off the field</h3>
            <p className="fa__hint">{SOILHEALTH_LABEL}</p>
            <div className="fa__scroll">
              <table className="fa__table">
                <caption className="sr-only">Nutrient removed per season, pounds per acre, for each rotation</caption>
                <thead>
                  <tr><th scope="col">Rotation</th>{NUTRIENT_KEYS.map((k) => <th scope="col" key={k}>{NUTRIENT_LABEL[k]}, lb per acre per season</th>)}<th scope="col">Replenishment</th></tr>
                </thead>
                <tbody>
                  {comparison.rotations.map((r) => <NutrientRow key={r.name} r={r} cropName={cropName} />)}
                </tbody>
              </table>
            </div>
            <ul className="method__notes">
              {comparison.notes.map((n) => <li key={n}>{n}</li>)}
              <li>Figures are published averages from other regions (Arkansas, Nebraska, Montana), not California measurements and not a soil test.</li>
            </ul>
            <NutrientSources cropIds={usedCropIds} cropName={cropName} />
          </div>

          {/* ---- Local expertise */}
          <div className="fa__card" data-testid="fa-expertise">
            <h3 className="rp-sub">What local and university experts say</h3>
            <p className="fa__hint">{EXPERTISE_LABEL}</p>
            {expertise.notes.map((n) => (
              <figure key={n.id} className="fa__quote">
                <blockquote>&ldquo;{n.quote}&rdquo;</blockquote>
                <figcaption>{n.by}. <a href={n.url} rel="noreferrer">{n.source}</a>. Read {n.readOn}. <em>{n.limits}</em></figcaption>
              </figure>
            ))}
            {expertise.gaps.map((g) => <p key={g.text} className="fa__gap">{g.text}</p>)}
          </div>
        </>
      )}

      {/* ---- AI */}
      <div className="fa__card fa__ai" data-testid="fa-ai">
        <h3 className="rp-sub">Plain-English summary written by AI</h3>
        <p className="fa__hint">
          Google&rsquo;s free Gemini service reads the computed results above and writes a short summary. Every figure in it has to come from your data, and a summary that fails that check is not shown.
        </p>
        <p className="fa__notice" role="note">
          On the free tier Google says content sent to it may be used to improve its products. What is sent: the results on this page, your yields and priorities, and your location rounded to the 50 km grid. Not sent: money amounts (budget, water price, water cost) and field size.
        </p>
        <button type="button" className="btn btn--primary" onClick={ask} disabled={!hasRotations || ai.state === "loading"}>
          {ai.state === "loading" ? "Writing…" : ai.state === "done" ? "Write it again" : "Send these results to Gemini and write the summary"}
        </button>
        <div aria-live="polite" className="fa__ai-out">
          {ai.state === "loading" && <p>Working. The first request can take up to a minute for a new place.</p>}
          {ai.state === "done" && ai.failure && <p className="fa__bad">{ai.failure}</p>}
          {stale && <p className="fa__stale">You changed something since this summary was written. Write it again to match.</p>}
          {ai.state === "done" && ai.outcome && <AiOutcome o={ai.outcome} />}
        </div>
      </div>
    </section>
  );
}

/** Source, page and link for every nutrient figure behind the table, so each number can be checked. */
function NutrientSources({ cropIds, cropName }: { cropIds: string[]; cropName: (id: string) => string }) {
  return (
    <details className="fa__sources" data-testid="fa-nutrient-sources">
      <summary>Where each nutrient figure comes from</summary>
      {cropIds.map((id) => {
        const n = getNutrients(id);
        if (!n) return <p key={id}>{cropName(id)}: no nutrient entry.</p>;
        return (
          <div key={id} className="fa__src">
            <h4>{cropName(id)} <small>({n.yieldUnit})</small></h4>
            <ul>
              {NUTRIENT_KEYS.map((k) => {
                const f = n.removalPerUnit[k];
                return (
                  <li key={k}>
                    <strong>{NUTRIENT_LABEL[k]}:</strong> {f.value === null ? "unknown" : `${f.value} lb per ${n.yieldUnit}`}. {f.source}, {f.page}.{" "}
                    {f.url && <a href={f.url} rel="noreferrer">Open source</a>}
                    {f.note ? <small> {f.note}</small> : null}
                  </li>
                );
              })}
              {n.removalAlternatives.map((a) => (
                <li key={a.label}>
                  <em>Other reading, {a.label}:</em> nitrogen {a.n ?? "not printed"}, phosphorus {a.p2o5 ?? "not printed"}, potassium {a.k2o ?? "not printed"} ({a.unit}). {a.source}, {a.page}.{" "}
                  {a.url && <a href={a.url} rel="noreferrer">Open source</a>}
                </li>
              ))}
              <li><strong>Nitrogen fixed by the crop:</strong> {n.nFixationLbPerAcre.low.value === null ? `unknown. ${n.nFixationLbPerAcre.low.note ?? ""}` : `${n.nFixationLbPerAcre.low.value} to ${n.nFixationLbPerAcre.high.value} lb per acre per season`}</li>
            </ul>
          </div>
        );
      })}
    </details>
  );
}

function NutrientRow({ r, cropName }: { r: RotationNutrientResult; cropName: (id: string) => string }) {
  const unknownNote = (k: (typeof NUTRIENT_KEYS)[number]) => {
    const u = r.cycle[k].unknownFor;
    if (u.length === 0) return null;
    return r.perCrop
      .filter((c) => u.includes(c.cropId))
      .map((c) => `${cropName(c.cropId)}: ${c.missing[k] ?? "unknown"}`)
      .join("; ");
  };
  return (
    <tr>
      <th scope="row">
        {r.name}
        {r.flags.sameCropBackToBack && <small> Same crop in two neighbouring seasons.</small>}
        {r.problems.length > 0 && <small> {r.problems.join(" ")}</small>}
      </th>
      {NUTRIENT_KEYS.map((k) => (
        <td key={k}>
          {fmt(r.cycle[k].perSeasonLbPerAcre, 1)}
          {unknownNote(k) && <small> {unknownNote(k)}</small>}
        </td>
      ))}
      <td>
        {r.replenishment.fixation.status === "none-known" ? "Unknown: no sourced figure for these crops." : "Some crops have a sourced figure; see the sources."}
        {r.replenishment.credits.map((c) => <small key={c.fromCropId + c.toCropId}> {cropName(c.fromCropId)} then {cropName(c.toCropId)}: {c.lbNPerAcre} lb nitrogen credit ({c.source}).</small>)}
      </td>
    </tr>
  );
}

function AiOutcome({ o }: { o: AdvisorOutcome }) {
  if (o.status === "not-connected") return <p className="fa__bad" data-testid="ai-not-connected">{o.message}</p>;
  if (o.status === "error") return <p className="fa__bad" data-testid="ai-error">{o.message}</p>;
  if (o.status === "rejected")
    return (
      <div className="fa__bad" data-testid="ai-rejected">
        <p>{o.message}</p>
        <details><summary>Why it was not shown</summary><ul>{o.reasons.map((r) => <li key={r}>{r}</li>)}</ul></details>
      </div>
    );
  return (
    <article className="fa__summary" data-testid="ai-summary">
      <p className="fa__label"><strong>{o.label}</strong></p>
      {o.rotationKey && o.rotationKey.length > 0 && <p className="fa__hint">The summary calls your rotations: {o.rotationKey.join("; ")}.</p>}
      <p className="fa__hint">Written just now ({new Date(o.generatedAt).toUTCString()}) by {o.model}. It is not stored, so it is not a saved response.</p>
      {o.reply.sections.map((s) => (
        <section key={s.id + s.heading}>
          <h4>{s.heading}</h4>
          {s.paragraphs.map((p, i) => (
            <div key={i}>
              <p>{p.text}</p>
              <details className="fa__facts"><summary>Based on</summary><ul>{p.facts.map((f) => <li key={f}><code>{f}</code></li>)}</ul></details>
            </div>
          ))}
        </section>
      ))}
      {o.reply.notAvailable.length > 0 && <p className="fa__gap">Not available for this place: {o.reply.notAvailable.join(", ")}.</p>}
    </article>
  );
}
