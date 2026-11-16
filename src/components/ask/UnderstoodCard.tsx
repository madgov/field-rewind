"use client";

import { useState } from "react";
import { PRIORITIES } from "@/lib/farmer/priorities";
import type { PriorityId } from "@/lib/farmer/priorities";
import type { Understood } from "@/lib/assistant/types";

type Props = {
  u: Understood;
  notice: string;
  cropName: (id: string) => string;
  onChange: (u: Understood) => void;
  /** Adds a typed answer to the farmer's words and reads them again. */
  onAnswer: (text: string) => void;
};

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "What we understood": every item is shown and can be corrected before a plan is made. Remount (key) on a new reading. */
export default function UnderstoodCard({ u, notice, cropName, onChange, onAnswer }: Props) {
  const [supplyText, setSupplyText] = useState(u.supplyMm === null ? "" : String(u.supplyMm));
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const setSupply = (t: string) => {
    setSupplyText(t);
    const n = Number(t);
    onChange({ ...u, supplyMm: t.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null });
  };
  const togglePrio = (p: PriorityId) =>
    onChange({ ...u, priorities: u.priorities.includes(p) ? u.priorities.filter((x) => x !== p) : [...u.priorities, p] });

  return (
    <div className="ask-card ask-understood" data-testid="ask-understood">
      <h3 className="ask-h3">What we understood</h3>
      <p className="ask-hint" role="note">{notice}</p>

      <h4 className="ask-h4">Crop rotations</h4>
      {u.rotations.length === 0 ? (
        <p className="ask-bad">No crop from our sourced list was heard. Name the crops you grow, in order, and read it again.</p>
      ) : (
        <ul className="ask-rots">
          {u.rotations.map((r, i) => (
            <li key={`${r.name}-${i}`} className="ask-rot">
              <span className="ask-rot__name">{r.name}</span>
              <span className="ask-chips">
                {r.sequence.map((id, k) => (
                  <span key={`${id}-${k}`} className="ask-chip">{k > 0 && <span aria-hidden="true">→ </span>}{cropName(id)}</span>
                ))}
              </span>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange({ ...u, rotations: u.rotations.filter((_, j) => j !== i) })}>
                Remove<span className="sr-only"> {r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {u.unmatchedCrops.length > 0 && (
        <p className="ask-hint">Also heard: {u.unmatchedCrops.join(", ")}. Not in our sourced crop list yet, so left out, not guessed.</p>
      )}

      <div className="ask-grid">
        <label className="ask-field">
          <span className="ask-label">Water you can put on per season (mm)</span>
          <input className="ask-input" inputMode="decimal" value={supplyText} onChange={(e) => setSupply(e.target.value)} />
          <small>{u.supplyAsSaid ? <>You said: &ldquo;{u.supplyAsSaid}&rdquo;. </> : "Not said yet. "}25.4 mm is one inch of water.</small>
        </label>
        <div className="ask-field">
          <span className="ask-label">Water budget</span>
          <p>{u.budget ? `${money(u.budget.amount)}${u.budget.per === "acre" ? " per acre" : u.budget.per === "total" ? " in total" : ""}` : "Not said"}</p>
        </div>
        <div className="ask-field">
          <span className="ask-label">Water price</span>
          <p>{u.waterPrice ? `$${money(u.waterPrice.amount)} per ${u.waterPrice.per}` : "Not said"}</p>
        </div>
        <div className="ask-field">
          <span className="ask-label">Field size</span>
          <p>{u.acres !== null ? `${money(u.acres)} acres` : "Not said"}</p>
        </div>
      </div>
      <p className="ask-hint">Budget amounts and field size stay in your browser. They are never sent to the AI.</p>

      <h4 className="ask-h4">What matters most</h4>
      <div className="ask-chips" role="group" aria-label="What matters most">
        {(Object.keys(PRIORITIES) as PriorityId[]).map((p) => (
          <button key={p} type="button" className={`ask-toggle ${u.priorities.includes(p) ? "ask-toggle--on" : ""}`} aria-pressed={u.priorities.includes(p)} onClick={() => togglePrio(p)}>
            {PRIORITIES[p].label}
          </button>
        ))}
      </div>

      {u.missing.length > 0 && (
        <>
          <h4 className="ask-h4">Still to answer</h4>
          <ul className="ask-missing">
            {u.missing.map((q, i) => (
              <li key={q}>
                <label className="ask-field">
                  <span className="ask-label">{q}</span>
                  <span className="ask-search__inputs">
                    <input className="ask-input" value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
                    <button type="button" className="btn btn--ghost btn--small" disabled={(answers[i] ?? "").trim() === ""} onClick={() => onAnswer(answers[i] ?? "")}>
                      Add and read again
                    </button>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
