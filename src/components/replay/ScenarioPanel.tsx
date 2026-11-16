"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { humidityNote, isIdentityScenario, describeScenario, RAIN_FACTOR_RANGE, SCENARIO_LABEL, TEMP_DELTA_RANGE, DEFAULT_SCENARIO } from "@/lib/scenario";
import type { HumidityMode, Scenario } from "@/lib/scenario";
import type { ScenarioCounts, ScenarioView } from "@/lib/advisor/scenarioView";

type Rot = { name: string; sequence: string[] };

type Props = {
  lat: number;
  lon: number;
  exampleFarm: boolean;
  rotations: Rot[];
  supplyMm: number;
  /** Shared with the AI advisor so it can describe the same what-if. */
  scenario: Scenario;
  onChange: (s: Scenario) => void;
};

type Fetched = { key: string; view?: ScenarioView; error?: string };

const DEBOUNCE_MS = 350;
const r2 = (v: number) => Math.round(v * 100) / 100;

const HUMIDITY_CHOICES: { id: HumidityMode; title: string; plain: string }[] = [
  {
    id: "hold-vapour-pressure",
    title: "Keep each day's real moisture in the air (default)",
    plain:
      "Warmer air can hold more water vapour, but the real air did not gain any. So the air feels drier and crops need more water. This is the smallest assumption about the real day.",
  },
  {
    id: "hold-rh",
    title: "Keep humidity as recorded",
    plain: "Relative humidity stays as it was, so warmer air holds more moisture than the real air did, and the extra water demand is smaller. This adds vapour the record never had.",
  },
];

export function rainWords(f: number): string {
  return f === 1 ? "as recorded" : `${Math.round(Math.abs(f - 1) * 100)}% ${f < 1 ? "less" : "more"} rain`;
}
export function tempWords(d: number): string {
  return d === 0 ? "as recorded" : `${Math.abs(d)} °C ${d < 0 ? "cooler" : "hotter"}`;
}

export default function ScenarioPanel(props: Props) {
  const uid = useId();
  const { scenario, onChange } = props;
  const neutral = isIdentityScenario(scenario);
  const humidity = scenario.humidity ?? DEFAULT_SCENARIO.humidity;

  const body = useMemo(
    () => ({
      lat: props.lat,
      lon: props.lon,
      exampleFarm: props.exampleFarm,
      rotations: props.rotations,
      supplyMm: props.supplyMm,
      scenario: { rainFactor: scenario.rainFactor, tempDeltaC: scenario.tempDeltaC, humidity },
    }),
    [props.lat, props.lon, props.exampleFarm, props.rotations, props.supplyMm, scenario.rainFactor, scenario.tempDeltaC, humidity],
  );
  const key = JSON.stringify(body);

  const [got, setGot] = useState<Fetched | null>(null);
  useEffect(() => {
    if (neutral) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: key, signal: ctl.signal });
        const json = (await res.json()) as ScenarioView | { status: "error"; message: string };
        if (json.status === "error") setGot({ key, error: json.message });
        else setGot({ key, view: json });
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setGot({ key, error: "The what-if could not be run. Check your connection and try again." });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [key, neutral]);

  const current = !neutral && got && got.key === key ? got : null;
  const loading = !neutral && !current;

  return (
    <section aria-labelledby="sc-h" className="rp-sec sc" data-testid="scenario-panel">
      <h2 id="sc-h" className="sh-h2"><span className="rp-step">4</span> What if the weather had been different?</h2>
      <p className="sh-lede">
        Change the rain or the temperature on every day of the real record and see how many seasons would have been short of water. It is a test on past weather. It is not a forecast.
      </p>
      <p className="sc__label" role="note" data-testid="scenario-label">{SCENARIO_LABEL}</p>
      <p className="sc__label" data-testid="scenario-climate-label">The weather being changed is regional climate, about 50 km grid: reanalysis, not a farm sensor.</p>

      <div className="fa__card sc__controls">
        <div className="sc__ctl">
          <label htmlFor={`${uid}-rain`} className="sc__name">Rain on every day</label>
          <output htmlFor={`${uid}-rain`} className="sc__val" data-testid="rain-value">{rainWords(scenario.rainFactor)}</output>
          <input
            id={`${uid}-rain`}
            className="sc__range"
            type="range"
            min={RAIN_FACTOR_RANGE.min}
            max={RAIN_FACTOR_RANGE.max}
            step={RAIN_FACTOR_RANGE.step}
            value={scenario.rainFactor}
            aria-valuetext={rainWords(scenario.rainFactor)}
            onChange={(e) => onChange({ ...scenario, rainFactor: r2(Number(e.target.value)) })}
          />
          <div className="sc__ends" aria-hidden="true"><span>{Math.round((1 - RAIN_FACTOR_RANGE.min) * 100)}% less</span><span>as recorded</span><span>{Math.round((RAIN_FACTOR_RANGE.max - 1) * 100)}% more</span></div>
        </div>

        <div className="sc__ctl">
          <label htmlFor={`${uid}-temp`} className="sc__name">Temperature on every day</label>
          <output htmlFor={`${uid}-temp`} className="sc__val" data-testid="temp-value">{tempWords(scenario.tempDeltaC)}</output>
          <input
            id={`${uid}-temp`}
            className="sc__range"
            type="range"
            min={TEMP_DELTA_RANGE.min}
            max={TEMP_DELTA_RANGE.max}
            step={TEMP_DELTA_RANGE.step}
            value={scenario.tempDeltaC}
            aria-valuetext={tempWords(scenario.tempDeltaC)}
            onChange={(e) => onChange({ ...scenario, tempDeltaC: r2(Number(e.target.value)) })}
          />
          <div className="sc__ends" aria-hidden="true"><span>{Math.abs(TEMP_DELTA_RANGE.min)} °C cooler</span><span>as recorded</span><span>{TEMP_DELTA_RANGE.max} °C hotter</span></div>
        </div>

        <fieldset className="sc__hum" disabled={scenario.tempDeltaC === 0}>
          <legend className="sc__name">Humidity when the temperature changes</legend>
          {HUMIDITY_CHOICES.map((c) => (
            <label key={c.id} className="sc__radio">
              <input type="radio" name={`${uid}-hum`} checked={humidity === c.id} onChange={() => onChange({ ...scenario, humidity: c.id })} />
              <span><strong>{c.title}.</strong> <small>{c.plain}</small></span>
            </label>
          ))}
          {scenario.tempDeltaC === 0 && <p className="fa__hint">This only matters when the temperature is changed.</p>}
        </fieldset>

        <div className="sc__actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange({ ...DEFAULT_SCENARIO })} disabled={neutral && humidity === DEFAULT_SCENARIO.humidity}>
            Reset to the real record
          </button>
          <p className="fa__hint" role="status">{neutral ? "Both sliders are at the real record, so the strips above are the answer." : `${describeScenario(scenario)}.`}</p>
        </div>
      </div>

      <div aria-live="polite" className="sc__out">
        {neutral && <p className="rp-empty">Move a slider to see what would have changed. At the real record the result is exactly the replay above.</p>}
        {loading && <p className="sc__loading" data-testid="scenario-loading"><span className="sc__spin" aria-hidden="true" /> Running all 40 seasons on the changed record…</p>}
        {current?.error && <p className="fa__bad" data-testid="scenario-error">{current.error}</p>}
        {current?.view?.status === "unavailable" && <p className="fa__bad">{current.view.reason}</p>}
        {current?.view?.status === "ok" && <Results v={current.view} />}
      </div>
    </section>
  );
}

function Bar({ c, kind, index }: { c: ScenarioCounts["byDecade"][number]; kind: "base" | "what"; index: number }) {
  const pct = c.judged > 0 ? Math.round((c.short / c.judged) * 100) : 0;
  return (
    <div className={`sc__bar sc__bar--${kind}`} aria-hidden="true">
      <span className="sc__fill" style={{ width: `${pct}%`, animationDelay: `${index * 60}ms` }} />
    </div>
  );
}

function Results({ v }: { v: Extract<ScenarioView, { status: "ok" }> }) {
  const cooler = v.settings.tempDeltaC < 0;
  const hum = humidityNote(v.settings.humidity, v.settings.tempDeltaC);
  return (
    <div className="sc__results" data-testid="scenario-results">
      <p className="sc__headline">{v.headline}</p>
      <div className="sc__cards">
        {v.rotations.map((r, i) => (
          <article key={r.name} className="rcard sc__card" style={{ "--k": i } as React.CSSProperties}>
            <header className="rcard__head">
              <h3 className="rcard__name">{r.name}</h3>
              <p className="rcard__seq">{r.cropNames.join(", then ")}</p>
            </header>
            <p className="sc__tot">
              Short of water: <strong>{r.baseline.short} of {r.baseline.judged}</strong> seasons as recorded, <strong className="sc__what">{r.scenario.short} of {r.scenario.judged}</strong> in the what-if.
            </p>
            <ul className="sc__decades">
              {r.baseline.byDecade.map((d, k) => {
                const w = r.scenario.byDecade[k];
                return (
                  <li key={d.label}>
                    <span className="sc__dl">{d.label}</span>
                    <span className="sc__bars">
                      <Bar c={d} kind="base" index={k} />
                      <Bar c={w} kind="what" index={k} />
                    </span>
                    <span className="sc__dn">{d.short} of {d.judged} → <strong>{w.short} of {w.judged}</strong></span>
                  </li>
                );
              })}
            </ul>
            <p className="sc__key" aria-hidden="true"><span className="sc__sw sc__sw--base" /> as recorded <span className="sc__sw sc__sw--what" /> what-if</p>
            <p className="rcard__sentence">{r.sentence}</p>
          </article>
        ))}
      </div>
      {cooler && (
        <p className="sc__warn" role="note" data-testid="scenario-cool-warning">
          <strong>Be careful with the cooler settings.</strong> They are the least faithful part of this what-if (see below).
        </p>
      )}
      <ul className="method__notes sc__notes">
        {v.caveats.map((c) => <li key={c}>{c}</li>)}
        {v.notes.filter((n) => n !== hum).map((n) => <li key={n}>{n}</li>)}
        {hum && <li>{hum}</li>}
        <li>Counts are small samples (10 seasons per decade), so a change of one or two seasons can be luck of the record rather than a trend.</li>
      </ul>
    </div>
  );
}
