"use client";

import { useId } from "react";
import type { Crop } from "@/lib/crops/types";
import { EXAMPLE_LABEL, EXAMPLE_ROTATIONS } from "@/lib/replay/examples";
import { MAX_ROTATIONS, MAX_SEQUENCE, MIN_ROTATIONS } from "@/lib/replay/assemble";
import { MAX_NAME_LENGTH, type RotationDraft } from "./urlState";

type Props = {
  rotations: RotationDraft[];
  crops: Crop[];
  isExample: boolean;
  /** Engine problems and warnings, grouped by rotation index; `general` are problems that name no rotation. */
  problemsByRotation: string[][];
  warningsByRotation: string[][];
  general: string[];
  onChange: (next: RotationDraft[]) => void;
  onLoadExample: () => void;
};

export default function RotationBuilder(p: Props) {
  const set = (i: number, patch: Partial<RotationDraft>) => p.onChange(p.rotations.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  // A name that only describes the crops (an example name, or one made from the crop names) follows the crops when they change,
  // so a rotation is never left called "Wheat, then maize" while it holds cotton. A name the user typed is left alone.
  const autoName = (seq: string[], i: number) => {
    const n = seq.map((id) => p.crops.find((c) => c.id === id)?.name ?? id).join(", then ");
    return n.length <= MAX_NAME_LENGTH ? n : `Rotation ${i + 1}`;
  };
  const isAuto = (r: RotationDraft, i: number) => r.name === autoName(r.sequence, i) || EXAMPLE_ROTATIONS.some((e) => e.name === r.name) || r.name === `Rotation ${i + 1}`;
  const setSeq = (i: number, sequence: string[]) => {
    const r = p.rotations[i];
    set(i, isAuto(r, i) ? { sequence, name: autoName(sequence, i) } : { sequence });
  };
  const setCrop = (i: number, k: number, id: string) => setSeq(i, p.rotations[i].sequence.map((c, j) => (j === k ? id : c)));
  const addCrop = (i: number) => {
    const seq = p.rotations[i].sequence;
    setSeq(i, [...seq, seq[seq.length - 1] ?? p.crops[0].id]);
  };
  const removeCrop = (i: number, k: number) => setSeq(i, p.rotations[i].sequence.filter((_, j) => j !== k));
  const addRotation = () => p.onChange([...p.rotations, { name: `Rotation ${p.rotations.length + 1}`, sequence: [p.crops[0].id] }]);
  const removeRotation = (i: number) => p.onChange(p.rotations.filter((_, k) => k !== i));

  return (
    <div className="rb">
      <div className="rb__top">
        <button type="button" className="btn btn--ghost rb__example" onClick={p.onLoadExample}>Load example rotations</button>
        {p.isExample ? (
          <p className="rb__label" role="note"><span className="rb__tag">Example</span> {EXAMPLE_LABEL}</p>
        ) : (
          <p className="rb__hint">Your own rotations. Each one repeats its crops in order, one crop per season, starting in 1986.</p>
        )}
      </div>

      {p.general.length > 0 && (
        <ul className="rb__problems" role="alert">
          {p.general.map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}

      <ol className="rb__list">
        {p.rotations.map((r, i) => (
          <li key={i} className="rot" style={{ "--k": i } as React.CSSProperties}>
            <RotationCard
              index={i}
              rotation={r}
              crops={p.crops}
              canRemove={p.rotations.length > MIN_ROTATIONS}
              problems={p.problemsByRotation[i] ?? []}
              warnings={p.warningsByRotation[i] ?? []}
              onName={(name) => set(i, { name })}
              onCrop={(k, id) => setCrop(i, k, id)}
              onAddCrop={() => addCrop(i)}
              onRemoveCrop={(k) => removeCrop(i, k)}
              onRemove={() => removeRotation(i)}
            />
          </li>
        ))}
      </ol>
      <div className="rb__add">
        <button type="button" className="btn btn--ghost" disabled={p.rotations.length >= MAX_ROTATIONS} onClick={addRotation}>Add a rotation</button>
        <span className="rb__count">{p.rotations.length} of {MAX_ROTATIONS} rotations (compare {MIN_ROTATIONS} or {MAX_ROTATIONS})</span>
      </div>
    </div>
  );
}

function RotationCard(props: {
  index: number;
  rotation: RotationDraft;
  crops: Crop[];
  canRemove: boolean;
  problems: string[];
  warnings: string[];
  onName: (n: string) => void;
  onCrop: (k: number, id: string) => void;
  onAddCrop: () => void;
  onRemoveCrop: (k: number) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const { rotation: r } = props;
  return (
    <div className="rot__card">
      <div className="rot__head">
        <span className="rot__num" aria-hidden="true">{props.index + 1}</span>
        <div className="rot__name">
          <label htmlFor={`${id}-n`}>Rotation name</label>
          <input id={`${id}-n`} type="text" value={r.name} maxLength={MAX_NAME_LENGTH} placeholder={`Rotation ${props.index + 1}`} onChange={(e) => props.onName(e.target.value)} />
        </div>
        <button type="button" className="rot__remove" disabled={!props.canRemove} onClick={props.onRemove} aria-label={`Remove rotation ${props.index + 1}${r.name ? `, ${r.name}` : ""}`} title="Remove this rotation">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </div>
      <ol className="slots">
        {r.sequence.map((cid, k) => (
          <li key={k} className="slot">
            <label htmlFor={`${id}-c${k}`} className="slot__label">Crop {k + 1}{k === 0 ? " (1986)" : ""}</label>
            <div className="slot__row">
              <select id={`${id}-c${k}`} value={cid} onChange={(e) => props.onCrop(k, e.target.value)}>
                {props.crops.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="button" className="slot__x" disabled={r.sequence.length <= 1} onClick={() => props.onRemoveCrop(k)} aria-label={`Remove crop ${k + 1} from ${r.name || `rotation ${props.index + 1}`}`}>
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              </button>
            </div>
          </li>
        ))}
        {r.sequence.length < MAX_SEQUENCE && (
          <li className="slot slot--add">
            <button type="button" className="btn btn--ghost btn--small" onClick={props.onAddCrop}>Add a crop to this rotation</button>
          </li>
        )}
      </ol>
      {props.problems.length > 0 && (
        <ul className="rot__problems" role="alert">
          {props.problems.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      {props.warnings.length > 0 && (
        <ul className="rot__warnings">
          {props.warnings.map((t) => (
            <li key={t}><span className="rot__warn-tag">Heads up</span> {t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
