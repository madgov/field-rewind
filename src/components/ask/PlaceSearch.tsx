"use client";

import { useState } from "react";
import type { GeocodeResponse, GeocodeResult } from "@/lib/assistant/types";

/** Place-name search through the server's geocode route. Picking a result sets the pin. */
export default function PlaceSearch({ onPick }: { onPick: (r: GeocodeResult) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "loading" } | { kind: "ok"; results: GeocodeResult[]; source: string; sourceUrl: string } | { kind: "error"; message: string }>({ kind: "idle" });

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim() === "") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
      const json = (await res.json()) as GeocodeResponse;
      if (json.status === "ok") setState({ kind: "ok", results: json.results, source: json.source, sourceUrl: json.sourceUrl });
      else setState({ kind: "error", message: json.message });
    } catch {
      setState({ kind: "error", message: "The place search did not answer. Check your connection." });
    }
  };

  return (
    <div className="ask-search">
      <form onSubmit={search} className="ask-search__row" role="search">
        <label className="ask-label" htmlFor="ask-place">Type a town, village or address</label>
        <div className="ask-search__inputs">
          <input id="ask-place" className="ask-input" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn btn--primary" disabled={state.kind === "loading" || q.trim() === ""}>
            {state.kind === "loading" ? "Searching…" : "Search"}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {state.kind === "error" && <p className="ask-bad">{state.message} You can tap the map instead.</p>}
        {state.kind === "ok" && state.results.length === 0 && <p className="ask-bad">No place by that name was found. Try a nearby town, or tap the map instead.</p>}
        {state.kind === "ok" && state.results.length > 0 && (
          <ul className="ask-results">
            {state.results.map((r) => (
              <li key={`${r.lat},${r.lon},${r.name}`}>
                <button type="button" className="ask-result" onClick={() => onPick(r)}>
                  <strong>{r.name}</strong>
                  <small>{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="ask-hint">
        Place search by OpenStreetMap Nominatim{state.kind === "ok" ? <> (<a href={state.sourceUrl} rel="noreferrer">{state.source}</a>)</> : null}.
      </p>
    </div>
  );
}
