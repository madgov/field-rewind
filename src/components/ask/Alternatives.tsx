"use client";

import { useState } from "react";
import type { AlternativeRow, AlternativesOk } from "@/lib/alternatives";

type Reply = (AlternativesOk & { regionNote: string }) | { status: "error"; message: string };
type State = { s: "idle" } | { s: "loading" } | { s: "done"; r: Reply } | { s: "failed"; message: string };

const NOTE =
  "Each crop modelled alone every season with your water supply over the real 1986 to 2025 record. The warmer and drier columns are what-ifs applied to that record, not forecasts. This compares water need only, not yield, price, pests or markets. Ask a local adviser before switching.";

function Bar({ label, c, i }: { label: string; c: AlternativeRow["shortLastDecade"] | null; i: number }) {
  if (!c) return <div className="alt-bar"><span className="alt-bar__label">{label}</span><span className="alt-bar__val">not available</span></div>;
  const pct = c.evaluated > 0 ? (c.short / c.evaluated) * 100 : 0;
  const tone = pct === 0 ? "ok" : pct <= 30 ? "mid" : "bad";
  return (
    <div className="alt-bar">
      <span className="alt-bar__label">{label}</span>
      <span className="alt-bar__track" aria-hidden="true">
        <span className={`alt-bar__fill alt-bar__fill--${tone}`} style={{ width: `${pct}%`, animationDelay: `${i * 60}ms` }} />
      </span>
      <span className="alt-bar__val">{c.short} of {c.evaluated}</span>
    </div>
  );
}

export default function Alternatives({ lat, lon, supplyMm, current, exampleFarm }: { lat: number; lon: number; supplyMm: number; current: string[]; exampleFarm?: boolean }) {
  const [st, setSt] = useState<State>({ s: "idle" });

  const run = async () => {
    setSt({ s: "loading" });
    try {
      const res = await fetch("/api/alternatives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon, supplyMm, current, ...(exampleFarm ? { exampleFarm: true } : {}) }),
      });
      setSt({ s: "done", r: (await res.json()) as Reply });
    } catch {
      setSt({ s: "failed", message: "The request did not complete. Check your connection and try again." });
    }
  };

  const r = st.s === "done" ? st.r : null;
  return (
    <div className="alt" id="alternatives">
      <button type="button" className="btn btn--ghost" data-testid="alternatives-run" onClick={() => void run()} disabled={st.s === "loading"}>
        {st.s === "loading" ? "Comparing every crop…" : "Which crops fit my water best?"}
      </button>
      <div aria-live="polite">
        {st.s === "failed" && <p className="ask-bad">{st.message}</p>}
        {r && r.status === "error" && <p className="ask-bad">{r.message}</p>}
        {r && r.status === "ok" && (
          <div className="alt-out">
            <p className="alt-note">{NOTE}</p>
                        <p className="ask-hint">Water supply {Math.round(r.supplyMm)} mm per season. Columns: seasons short of water out of the last 10 judged (2016 to 2025). {r.dataLabel}. {r.regionNote}</p>
            <p className="alt-note alt-note--planting">{r.plantingNote}</p>
            {r.groups.map((g) => (
              <section key={g.id} className="alt-group" aria-label={g.label}>
                <h3 className="alt-group__h">{g.label}</h3>
                <p className="alt-group__headline">{g.headline}</p>
                <ol className="alt-list">
                  {g.rows.map((row, i) => (
                    <li key={row.id} className={`alt-row ${row.current ? "alt-row--current" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="alt-row__head">
                        <span className="alt-row__name">{row.ranked ? `${i + 1}. ` : ""}{row.name}</span>
                        {row.current && <span className="alt-tag">You grow this</span>}
                        <span className="alt-row__need">{row.medianNeedMm === null ? "need unknown" : `median irrigation need ${row.medianNeedMm} mm`}</span>
                      </div>
                      <p className="alt-row__meta">Planted in {row.plantingMonth}. FAO row: {row.faoRegion ?? "region not stated in the citation"}.</p>
                      {row.ranked && (
                        <div className="alt-bars">
                          <Bar label="Real record" c={row.shortLastDecade} i={i} />
                          <Bar label="2 °C warmer" c={row.warmerLastDecade} i={i + 1} />
                          <Bar label="20% less rain" c={row.drierLastDecade} i={i + 2} />
                        </div>
                      )}
                      <p className="alt-row__line">{row.line}</p>
                      {!row.heatThresholdKnown && <p className="alt-row__heat">Heat limit for this crop is not known from a cited source, so hot days are not counted and not used in the ranking.</p>}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
            {r.skipped.length > 0 && (
              <p className="ask-hint">Not compared: {r.skipped.map((s) => `${s.id} (${s.reason})`).join("; ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
