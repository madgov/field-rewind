"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Crop } from "@/lib/crops/types";
import { replayFromSeasonTable, type SeasonTable } from "@/lib/replay/assemble";
import { EXAMPLE_SUPPLY_MM, EXAMPLE_SUPPLY_NOTE } from "@/lib/replay/examples";
import { FIRST_SEASON, LAST_SEASON, type ReplayOk, type ReplayResult } from "@/lib/replay/types";
import type { PowerResult } from "@/lib/types";
import { cropAbbreviations } from "./cells";
import CropSources, { type ExcludedCrop } from "./CropSources";
import Gauge from "./Gauge";
import Method from "./Method";
import RotationBuilder from "./RotationBuilder";
import Scrubber from "./Scrubber";
import Strip, { StripLegend } from "./Strip";
import SupplyControl, { SupplyNote } from "./SupplyControl";
import { encodeState, exampleRotations, nameOrDefault, rotationsAreExample, type ReplayState, type RotationDraft } from "./urlState";

export type { ExcludedCrop };

const PLAY_STEP_MS = 1100;
const URL_WRITE_MS = 250;
const SPEAK_DEBOUNCE_MS = 800;

type Props = {
  table: SeasonTable;
  crops: Crop[];
  excluded: ExcludedCrop[];
  header: Omit<PowerResult, "days">;
  lat: number;
  lon: number;
  supplyMaxMm: number;
  compiledOn: string;
  initial: ReplayState;
  notes: string[];
};

export default function ReplayApp(props: Props) {
  const { table, crops } = props;
  const [rotations, setRotations] = useState<RotationDraft[]>(props.initial.rotations);
  const [supplyMm, setSupplyMm] = useState(props.initial.supplyMm);
  const [year, setYear] = useState(props.initial.year);
  const [playing, setPlaying] = useState(false);
  const [dismissedNotes, setDismissedNotes] = useState(false);

  const isExample = rotationsAreExample(rotations);
  const abbr = useMemo(() => cropAbbreviations(crops), [crops]);

  // The engine does all the work: the season table (from the server) + these inputs. No rule is applied in this file.
  const engineRotations = useMemo(() => rotations.map((r, i) => ({ name: nameOrDefault(r.name, i), sequence: r.sequence })), [rotations]);
  const result: ReplayResult = useMemo(() => replayFromSeasonTable(table, crops, { rotations: engineRotations, supplyMm }), [table, crops, engineRotations, supplyMm]);
  const ok: ReplayOk | null = result.status === "ok" ? result : null;

  // Problems and warnings from the engine, next to the rotation they name.
  const { problemsByRotation, general } = useMemo(() => {
    const by: string[][] = rotations.map(() => []);
    const gen: string[] = [];
    if (result.status === "unavailable") {
      for (const p of result.problems) {
        const idx = engineRotations.findIndex((r) => p.startsWith(`${r.name}:`));
        if (idx >= 0) by[idx].push(p);
        else gen.push(p);
      }
    }
    return { problemsByRotation: by, general: gen };
  }, [result, engineRotations, rotations]);
  const warningsByRotation = useMemo(() => (ok ? ok.rotations.map((r) => r.warnings) : rotations.map(() => [] as string[])), [ok, rotations]);

  // ---- URL state (shareable). Throttled; replaceState keeps the back button for page navigation.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const qs = encodeState({ rotations, supplyMm, year });
        const url = `${window.location.pathname}?lat=${props.lat.toFixed(4)}&lon=${props.lon.toFixed(4)}&${qs}`;
        window.history.replaceState(window.history.state, "", url);
      } catch {
        /* a blocked history API only means the link is not updated */
      }
    }, URL_WRITE_MS);
    return () => clearTimeout(t);
  }, [rotations, supplyMm, year, props.lat, props.lon]);

  // ---- Autoplay: steps one season per tick and stops by itself at the last season.
  const running = playing && year < LAST_SEASON;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setYear((y) => Math.min(LAST_SEASON, y + 1)), PLAY_STEP_MS);
    return () => clearInterval(id);
  }, [running]);

  const togglePlay = () => {
    if (running) setPlaying(false);
    else {
      if (year >= LAST_SEASON) setYear(FIRST_SEASON);
      setPlaying(true);
    }
  };
  const pickYear = useCallback((y: number) => {
    setPlaying(false);
    setYear(y);
  }, []);

  // ---- Screen-reader announcements: polite, debounced, and silent while autoplay is running.
  const seasonText = ok ? ok.rotations.map((r) => r.seasons[year - FIRST_SEASON]).map((s, i) => `${ok.rotations[i].name}: ${s.cropName}, ${s.outcome === "short" ? "short of water" : s.outcome === "ok" ? "covered" : "not enough data"}.`).join(" ") : "";
  const headlineText = ok ? ok.rotations.map((r) => `${r.name}. ${r.headline}.`).join(" ") : "";
  const [saidSeason, setSaidSeason] = useState("");
  const [saidHeadline, setSaidHeadline] = useState("");
  useEffect(() => {
    if (running) return;
    const t = setTimeout(() => setSaidSeason(seasonText ? `${year}. ${seasonText}` : ""), SPEAK_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [seasonText, year, running]);
  useEffect(() => {
    const t = setTimeout(() => setSaidHeadline(headlineText), SPEAK_DEBOUNCE_MS + 300);
    return () => clearTimeout(t);
  }, [headlineText]);

  const usedLetters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rotations) for (const id of r.sequence) if (!seen.has(id)) seen.set(id, id);
    return crops.filter((c) => seen.has(c.id)).map((c) => ({ abbr: abbr[c.id], name: c.name }));
  }, [rotations, crops, abbr]);

  const loadExample = () => {
    setRotations(exampleRotations());
    setSupplyMm(EXAMPLE_SUPPLY_MM);
  };

  return (
    <main className="rp-main">
      {props.notes.length > 0 && !dismissedNotes && (
        <section className="rp-notice" role="status" aria-label="About the link you opened">
          <ul>{props.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setDismissedNotes(true)}>Dismiss</button>
        </section>
      )}

      <section aria-labelledby="rp-in-h" className="rp-sec">
        <h2 id="rp-in-h" className="sh-h2"><span className="rp-step">1</span> Your rotations</h2>
        <p className="sh-lede">A rotation is the crops you grow in turn, one crop per season. Pick 1 to 3 crops for each of 2 or 3 rotations.</p>
        <RotationBuilder
          rotations={rotations}
          crops={crops}
          isExample={isExample}
          problemsByRotation={problemsByRotation}
          warningsByRotation={warningsByRotation}
          general={general}
          onChange={setRotations}
          onLoadExample={loadExample}
        />
        <h3 className="rp-sub">Your water supply</h3>
        <SupplyNote maxMm={props.supplyMaxMm} exampleNote={isExample && supplyMm === EXAMPLE_SUPPLY_MM ? EXAMPLE_SUPPLY_NOTE : null} />
      </section>

      <section aria-labelledby="rp-supply-h" className="rp-sec rp-sec--supply">
        <h2 id="rp-supply-h" className="sr-only">Your water supply</h2>
        <SupplyControl
          supplyMm={supplyMm}
          maxMm={props.supplyMaxMm}
          onChange={setSupplyMm}
        />
      </section>

      <section aria-labelledby="rp-strips-h" className="rp-sec">
        <h2 id="rp-strips-h" className="sh-h2"><span className="rp-step">2</span> 40 seasons, 1986 to 2025</h2>
        <p className="sh-lede">One cell per season, for each rotation. Move the water supply above and watch the cells change. Tap a cell to look at that season below.</p>
        <StripLegend crops={usedLetters} />
        {ok ? (
          <div className="rp-strips">
            {ok.rotations.map((r, i) => (
              <article key={i} className="rcard" style={{ "--k": i } as React.CSSProperties}>
                <header className="rcard__head">
                  <h3 className="rcard__name">{r.name}</h3>
                  <p className="rcard__seq">{r.cropNames.join(", then ")}</p>
                </header>
                <p className="rcard__headline" key={r.headline}>{r.headline}</p>
                <Strip rotation={r} year={year} abbr={abbr} onPick={pickYear} />
                <p className="rcard__total">
                  All 40 seasons: {r.totals.short} short, {r.totals.ok} covered{r.totals.insufficient > 0 ? `, ${r.totals.insufficient} not judged` : ""}.
                </p>
                <p className="rcard__sentence">{r.sentence}</p>
                <p className="rcard__caveat">{r.caveat}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="rp-empty" role="status">The replay cannot run with the rotations as they are. The problems are listed next to each rotation above.</p>
        )}
      </section>

      <section aria-labelledby="rp-gauge-h" className="rp-sec">
        <h2 id="rp-gauge-h" className="sh-h2"><span className="rp-step">3</span> Look at one season</h2>
        <p className="sh-lede">Drag the season, step through, or press play. Each gauge shows the crop&rsquo;s need beyond rain as water filling a vessel whose line is your supply.</p>
        <Scrubber year={year} playing={running} onYear={pickYear} onTogglePlay={togglePlay} />
        {ok && (
          <div className="gauges">
            {ok.rotations.map((r, i) => (
              <Gauge key={i} name={r.name} s={r.seasons[year - FIRST_SEASON]} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="rp-src-h" className="rp-sec">
        <h2 id="rp-src-h" className="sh-h2">Where the crop numbers come from</h2>
        <CropSources crops={crops} excluded={props.excluded} compiledOn={props.compiledOn} />
      </section>

      <section aria-labelledby="rp-method-h" className="rp-sec">
        <h2 id="rp-method-h" className="sh-h2">How we know</h2>
        <Method header={props.header} dataLabel={table.dataLabel} notes={ok ? ok.notes : []} />
      </section>

      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-season">{saidSeason}</div>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-headline">{saidHeadline}</div>
    </main>
  );
}
