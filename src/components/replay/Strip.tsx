"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { FIRST_SEASON, LAST_SEASON, type RotationResult, type SeasonResult } from "@/lib/replay/types";
import { cellKind, cellLabel, decadeCountText } from "./cells";

const Check = () => (
  <svg className="cell__mark" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2 6.5 5 9.2 10 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Cross = () => (
  <svg className="cell__mark" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

export default function Strip(props: {
  rotation: RotationResult;
  year: number;
  abbr: Record<string, string>;
  /** Crop id of each season, aligned with rotation.seasons. */
  onPick: (year: number) => void;
}) {
  const { rotation: rot, year } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      // Not set synchronously: avoids a cascading render and keeps SSR output identical.
      const t = setTimeout(() => setInView(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const move = (to: number, focus: boolean) => {
    const y = Math.max(FIRST_SEASON, Math.min(LAST_SEASON, to));
    props.onPick(y);
    if (focus) {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-year="${y}"]`);
      el?.focus();
    }
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = {
      ArrowLeft: year - 1,
      ArrowRight: year + 1,
      ArrowUp: year - 10,
      ArrowDown: year + 10,
      PageUp: year - 10,
      PageDown: year + 10,
      Home: FIRST_SEASON,
      End: LAST_SEASON,
    };
    if (e.key in map) {
      e.preventDefault();
      move(map[e.key], true);
    }
  };

  return (
    <div ref={rootRef} className={`strip40${inView ? " is-in" : ""}`} role="group" aria-label={`${rot.name}: ${FIRST_SEASON} to ${LAST_SEASON}, one cell per season. Arrow keys move between years.`} onKeyDown={onKey}>
      {rot.decades.map((d) => (
        <div key={d.label} className="decade">
          <p className="decade__head">
            <span className="decade__label">{d.label}</span>
            <strong className="decade__count">{decadeCountText(d)}</strong>
          </p>
          <div className="decade__cells">
            {rot.seasons
              .filter((s) => s.year >= d.startYear && s.year <= d.endYear)
              .map((s) => (
                <Cell key={s.year} s={s} index={s.year - FIRST_SEASON} selected={s.year === year} abbr={props.abbr[s.cropId] ?? "?"} onPick={() => move(s.year, false)} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Cell({ s, index, selected, abbr, onPick }: { s: SeasonResult; index: number; selected: boolean; abbr: string; onPick: () => void }) {
  const kind = cellKind(s);
  return (
    <button
      type="button"
      data-year={s.year}
      className={`cell cell--${kind}${selected ? " is-sel" : ""}`}
      style={{ "--i": index } as CSSProperties}
      aria-label={cellLabel(s)}
      aria-pressed={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onPick}
    >
      <span className="cell__col">
        <span className="cell__fill">
          {kind === "ok" && <Check />}
          {kind === "short" && <Cross />}
          <span className="cell__crop" aria-hidden="true">{abbr}</span>
        </span>
      </span>
      <span className="cell__yr" aria-hidden="true">{String(s.year).slice(2)}</span>
    </button>
  );
}

export function StripLegend({ crops }: { crops: { abbr: string; name: string }[] }) {
  return (
    <ul className="legend legend--cells">
      <li className="legend__item"><span className="lg lg--ok" aria-hidden="true"><svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 6.5 5 9.2 10 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> Green, full cell, tick: supply covers modelled need</li>
      <li className="legend__item"><span className="lg lg--short" aria-hidden="true"><svg viewBox="0 0 12 12" width="11" height="11"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg></span> Red, shorter cell with a notched top, cross: short of water</li>
      <li className="legend__item"><span className="lg lg--grey" aria-hidden="true" /> Grey, hatched: not enough data to judge</li>
      {crops.length > 0 && (
        <li className="legend__item legend__crops">Letters: {crops.map((c) => `${c.abbr} = ${c.name}`).join(", ")}</li>
      )}
    </ul>
  );
}
