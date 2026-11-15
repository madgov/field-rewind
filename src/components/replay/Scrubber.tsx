"use client";

import { useId } from "react";
import { FIRST_SEASON, LAST_SEASON } from "@/lib/replay/types";

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function Scrubber(props: { year: number; playing: boolean; onYear: (y: number) => void; onTogglePlay: () => void }) {
  const id = useId();
  const { year } = props;
  return (
    <div className="scrub" role="group" aria-labelledby={`${id}-l`}>
      <div className="scrub__top">
        <p id={`${id}-l`} className="scrub__label">Season</p>
        <p className="scrub__year" aria-hidden="true">{year}</p>
        <div className="scrub__btns">
          <button type="button" className="step-btn step-btn--lg" aria-label="Previous season" disabled={year <= FIRST_SEASON} onClick={() => props.onYear(year - 1)}>
            <Icon d="M12.5 4 6.5 10l6 6" />
          </button>
          <button type="button" className="scrub__play" aria-pressed={props.playing} onClick={props.onTogglePlay}>
            {props.playing ? (
              <><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>Pause</>
            ) : (
              <><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" fill="currentColor" /></svg>{year >= LAST_SEASON ? "Replay" : "Play"}</>
            )}
          </button>
          <button type="button" className="step-btn step-btn--lg" aria-label="Next season" disabled={year >= LAST_SEASON} onClick={() => props.onYear(year + 1)}>
            <Icon d="m7.5 4 6 6-6 6" />
          </button>
        </div>
      </div>
      <input
        className="scrub__range"
        type="range"
        min={FIRST_SEASON}
        max={LAST_SEASON}
        step={1}
        value={year}
        aria-label={`Season, ${FIRST_SEASON} to ${LAST_SEASON}`}
        aria-valuetext={`${year} season`}
        onChange={(e) => props.onYear(Number(e.target.value))}
      />
      <div className="scrub__ticks" aria-hidden="true">
        {[1986, 1996, 2006, 2016, 2025].map((y) => (
          <span key={y}>{y}</span>
        ))}
      </div>
    </div>
  );
}
