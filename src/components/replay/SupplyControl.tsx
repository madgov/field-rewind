"use client";

import { useId, useState } from "react";
import { formatInches } from "@/lib/shift/units";

export const SUPPLY_STEP_MM = 5;

export default function SupplyControl(props: { supplyMm: number; maxMm: number; onChange: (mm: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const { supplyMm, maxMm } = props;

  const onText = (v: string) => {
    setDraft(v);
    const n = v.trim() === "" ? NaN : Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= maxMm) props.onChange(Math.round(n));
  };
  const typed = draft !== null ? Number(draft) : supplyMm;
  const draftBad = draft !== null && (draft.trim() === "" || !Number.isFinite(typed) || typed < 0 || typed > maxMm);

  return (
    <div className="supply" role="group" aria-labelledby={`${id}-l`}>
      <div className="supply__row">
        <label id={`${id}-l`} htmlFor={`${id}-n`} className="supply__label">Water supply for one growing season</label>
        <div className="supply__num">
          <input
            id={`${id}-n`}
            className="supply__input"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxMm}
            step={1}
            value={draft ?? String(supplyMm)}
            aria-invalid={draftBad || undefined}
            aria-describedby={`${id}-d`}
            onChange={(e) => onText(e.target.value)}
            onBlur={() => setDraft(null)}
          />
          <span className="supply__unit">mm</span>
          <span className="supply__in" aria-hidden={false}>({formatInches(supplyMm)})</span>
        </div>
      </div>
      <input
        className="supply__range"
        type="range"
        min={0}
        max={maxMm}
        step={SUPPLY_STEP_MM}
        value={supplyMm}
        aria-label="Water supply in millimetres, slider"
        aria-describedby={`${id}-d`}
        onChange={(e) => {
          setDraft(null);
          props.onChange(Number(e.target.value));
        }}
      />
      <div className="supply__scale" aria-hidden="true">
        <span>0 mm</span>
        <span>{maxMm.toLocaleString("en-US")} mm ({formatInches(maxMm)})</span>
      </div>
      <p id={`${id}-d`} className="supply__err-line">
        {draftBad && <strong className="supply__err">Enter a number from 0 to {maxMm.toLocaleString("en-US")} mm.</strong>}
      </p>
    </div>
  );
}

export function SupplyNote({ maxMm, exampleNote }: { maxMm: number; exampleNote: string | null }) {
  return (
    <div className="supply-note">
      <p>
        <strong>What the water supply means.</strong> It is the water you could apply in one growing season. Each season, a crop&rsquo;s need is what it uses beyond the rain that counts, and the supply is compared with that need. It is not reduced for delivery losses, so a real system must deliver more than the need.
      </p>
      <p className="supply-note__small">
        The slider runs from 0 to {maxMm.toLocaleString("en-US")} mm, the next round 100 mm above the largest single-season need of any crop here on this record.
        {exampleNote && <> {exampleNote}</>}
      </p>
    </div>
  );
}
