"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PinPicker from "@/components/PinPicker";
import { formatLat, formatLon, type Pin } from "@/components/geo";
import { DEFAULT_YEAR, encodeState } from "@/components/replay/urlState";
import type { AdvisorOutcome } from "@/lib/advisor/run";
import type { Understood, UnderstandResponse } from "@/lib/assistant/types";
import type { Scenario } from "@/lib/scenario";
import Alternatives from "./Alternatives";
import MicButton from "./MicButton";
import PlaceSearch from "./PlaceSearch";
import PlanView from "./PlanView";
import UnderstoodCard from "./UnderstoodCard";

type CropRef = { id: string; name: string };
type WhatIf = "real" | "warmer" | "drier";

const WHAT_IFS: { id: WhatIf; label: string; scenario?: Scenario }[] = [
  { id: "real", label: "The real last 40 seasons" },
  { id: "warmer", label: "The same seasons, 2 °C warmer", scenario: { rainFactor: 1, tempDeltaC: 2 } },
  { id: "drier", label: "The same seasons with 20 percent less rain", scenario: { rainFactor: 0.8, tempDeltaC: 0 } },
];

/** Starting pin from ?lat=&lon= (other pages link here with 4 decimals). Invalid or missing values are ignored. */
function pinFromQuery(lat: string | null, lon: string | null): Pin | null {
  if (lat === null || lon === null || lat.trim() === "" || lon.trim() === "") return null;
  const a = Number(lat);
  const b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lon: b };
}

export default function AskClient({ crops }: { crops: CropRef[] }) {
  // ---- Step 1: place
  const params = useSearchParams();
  const [pin, setPin] = useState<Pin | null>(() => pinFromQuery(params.get("lat"), params.get("lon")));
  const [placeName, setPlaceName] = useState<string | null>(null);

  // ---- Step 2: words and understanding
  const [text, setText] = useState("");
  const [reading, setReading] = useState<{ state: "idle" | "loading" } | { state: "error"; message: string }>({ state: "idle" });
  const [understood, setUnderstood] = useState<{ u: Understood; notice: string; n: number } | null>(null);
  const readCount = useRef(0);

  const appendText = useCallback((t: string) => {
    if (!t) return;
    setText((cur) => (cur.trim() === "" ? t : `${cur.replace(/\s+$/, "")} ${t}`));
  }, []);

  const read = async (words: string) => {
    if (words.trim() === "") return;
    setReading({ state: "loading" });
    try {
      const res = await fetch("/api/assistant/understand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: words }) });
      const json = (await res.json()) as UnderstandResponse;
      if (json.status === "ok") {
        readCount.current += 1;
        setUnderstood({ u: json.understood, notice: json.notice, n: readCount.current });
        setReading({ state: "idle" });
      } else setReading({ state: "error", message: json.message });
    } catch {
      setReading({ state: "error", message: "Your words could not be sent. Check your connection and try again." });
    }
  };

  const answer = (a: string) => {
    const next = `${text.replace(/\s+$/, "")} ${a.trim()}`.trim();
    setText(next);
    void read(next);
  };

  // ---- Step 3: plan
  const [whatIf, setWhatIf] = useState<WhatIf>("real");
  const [plan, setPlan] = useState<{ state: "idle" | "loading" } | { state: "done"; outcome?: AdvisorOutcome; failure?: string }>({ state: "idle" });
  const abort = useRef<AbortController | null>(null);

  const u = understood?.u ?? null;
  const rotations = (u?.rotations ?? []).slice(0, 3).filter((r) => r.sequence.length >= 1 && r.sequence.length <= 6).map((r) => ({ name: r.name.slice(0, 80), sequence: r.sequence }));
  const supplyOk = u !== null && u.supplyMm !== null && Number.isFinite(u.supplyMm) && u.supplyMm >= 0;
  const ready = pin !== null && rotations.length > 0 && supplyOk;
  const blockers = [!pin && "pick where your field is", rotations.length === 0 && "name at least one crop rotation", !supplyOk && "give the water you can put on per season"].filter(Boolean) as string[];

  const makePlan = async () => {
    if (!ready || !pin || !u || u.supplyMm === null) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setPlan({ state: "loading" });
    const scenario = WHAT_IFS.find((w) => w.id === whatIf)?.scenario;
    const body = {
      lat: pin.lat,
      lon: pin.lon,
      rotations,
      supplyMm: u.supplyMm,
      yields: {},
      priorities: u.priorities,
      ...(scenario ? { scenario } : {}),
      budgetUsed: u.budget !== null,
    };
    try {
      const res = await fetch("/api/advisor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      const json = (await res.json()) as AdvisorOutcome;
      setPlan({ state: "done", outcome: json });
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      setPlan({ state: "done", failure: "The request did not complete. Check your connection and try again." });
    }
  };

  const cropName = (id: string) => crops.find((c) => c.id === id)?.name ?? id;
  const q = pin ? `lat=${pin.lat.toFixed(4)}&lon=${pin.lon.toFixed(4)}` : "";
  const replayHref = pin && u && u.supplyMm !== null && rotations.length > 0
    ? `/replay?${q}&${encodeState({ rotations, supplyMm: Math.round(u.supplyMm), year: DEFAULT_YEAR })}`
    : `/replay?${q}`;

  return (
    <div className="ask">
      {/* ---- Step 1 */}
      <section className="ask-step" aria-labelledby="ask-s1">
        <h2 id="ask-s1" className="ask-h2"><span className="ask-num" aria-hidden="true">1</span> Where is your field?</h2>
        <div className="ask-place">
          <div className="ask-place__search">
            <PlaceSearch
              onPick={(r) => {
                setPin({ lat: r.lat, lon: r.lon });
                setPlaceName(r.name);
              }}
            />
            <div className="ask-chosen" aria-live="polite">
              {pin ? (
                <p>
                  <strong>Your field:</strong> {placeName ?? "Spot picked on the map"}
                  <br />
                  <span className="ask-coords">{formatLat(pin.lat)}, {formatLon(pin.lon)}</span>
                </p>
              ) : (
                <p className="ask-hint">No place chosen yet. Search above, or tap the map.</p>
              )}
            </div>
          </div>
          <div className="ask-map mapwrap">
            <PinPicker
              value={pin}
              onChange={(p) => {
                setPin(p);
                setPlaceName(null);
              }}
            />
          </div>
        </div>
      </section>

      {/* ---- Step 2 */}
      <section className="ask-step" aria-labelledby="ask-s2">
        <h2 id="ask-s2" className="ask-h2"><span className="ask-num" aria-hidden="true">2</span> Tell us about your farm</h2>
        <div className="ask-talk">
          <MicButton onFinal={appendText} />
          <div className="ask-talk__text">
            <label className="ask-label" htmlFor="ask-words">Your words (speak, or type here)</label>
            <textarea id="ask-words" className="ask-textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="ask-say" />
            <div id="ask-say" className="ask-say">
              <p><strong>What to say:</strong></p>
              <ul>
                <li>Your crops in the order you grow them, for example &ldquo;tomatoes, then wheat, then beans&rdquo;.</li>
                <li>How much water you can put on per season, for example &ldquo;2 acre-feet per acre&rdquo;.</li>
                <li>Your field size, what you can spend on water and the water price.</li>
                <li>What matters most: fewer dry years, less water, a lower bill, or the soil.</li>
              </ul>
            </div>
            <button type="button" className="btn btn--primary" onClick={() => void read(text)} disabled={text.trim() === "" || reading.state === "loading"}>
              {reading.state === "loading" ? "Reading…" : "Read what I said"}
            </button>
            <div aria-live="polite">
              {reading.state === "error" && <p className="ask-bad">{reading.message}</p>}
            </div>
          </div>
        </div>
        {understood && (
          <UnderstoodCard
            key={understood.n}
            u={understood.u}
            notice={understood.notice}
            cropName={cropName}
            onChange={(nu) => setUnderstood((s) => (s ? { ...s, u: nu } : s))}
            onAnswer={answer}
          />
        )}
      </section>

      {/* ---- Step 3 */}
      <section className="ask-step" aria-labelledby="ask-s3">
        <h2 id="ask-s3" className="ask-h2"><span className="ask-num" aria-hidden="true">3</span> Your plan</h2>
        <fieldset className="ask-whatif">
          <legend className="ask-label">Plan against</legend>
          {WHAT_IFS.map((w) => (
            <label key={w.id} className={`ask-toggle ${whatIf === w.id ? "ask-toggle--on" : ""}`}>
              <input type="radio" name="ask-whatif" value={w.id} checked={whatIf === w.id} onChange={() => setWhatIf(w.id)} className="sr-only" />
              {w.label}
            </label>
          ))}
          <p className="ask-hint">The warmer and drier choices are what-ifs applied to the real weather record. They are not forecasts.</p>
        </fieldset>
        {!ready && <p className="ask-hint" role="status">To make a plan, {blockers.join(", ")}.</p>}
        <div className="ask-actions">
          <button type="button" className="btn btn--primary ask-go" onClick={() => void makePlan()} disabled={!ready || plan.state === "loading"}>
            {plan.state === "loading" ? "Working…" : plan.state === "done" ? "Make the plan again" : "Make my plan"}
          </button>
          {plan.state === "done" && plan.outcome?.status === "ok" && (
            <button type="button" className="btn btn--ghost" onClick={() => window.print()}>Print this plan</button>
          )}
        </div>
        <div aria-live="polite" className="ask-out">
          {plan.state === "loading" && (
            <p className="ask-working"><span className="ask-spin" aria-hidden="true" /> Computing 40 seasons from NASA weather data, then asking the AI to write it up. This can take up to a minute.</p>
          )}
          {plan.state === "done" && plan.failure && <p className="ask-bad">{plan.failure}</p>}
          {plan.state === "done" && plan.outcome && <PlanView o={plan.outcome} />}
        </div>
        {pin && supplyOk && u && u.supplyMm !== null && (
          <Alternatives lat={pin.lat} lon={pin.lon} supplyMm={u.supplyMm} current={[...new Set(rotations.flatMap((r) => r.sequence))]} />
        )}
        {pin && (
          <div className="ask-evidence">
            <p><strong>See the full evidence for this spot:</strong></p>
            <ul>
              <li><Link href={replayHref}>40-season water replay</Link></li>
              <li><Link href={`/conditions?${q}`}>Field conditions: soil, frost, greenness, terrain</Link></li>
              <li><Link href={`/shift?${q}`}>How the climate here has shifted</Link></li>
            </ul>
            <p className="ask-hint">Climate figures are regional climate, about 50 km grid (NASA POWER reanalysis), not a sensor on your farm. This is a planning aid, not a substitute for a soil test or a local advisor.</p>
          </div>
        )}
      </section>
    </div>
  );
}
