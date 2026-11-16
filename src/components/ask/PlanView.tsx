"use client";

import type { AdvisorOutcome } from "@/lib/advisor/run";

/** The checked advisor reply as cards that arrive one after another. Wording of the failure states matches the replay page. */
export default function PlanView({ o }: { o: AdvisorOutcome }) {
  if (o.status === "not-connected") return <p className="ask-bad" data-testid="ai-not-connected">{o.message}</p>;
  if (o.status === "error") return <p className="ask-bad" data-testid="ai-error">{o.message}</p>;
  if (o.status === "rejected")
    return (
      <div className="ask-bad" data-testid="ai-rejected">
        <p>{o.message}</p>
        <details><summary>Why it was not shown</summary><ul>{o.reasons.map((r) => <li key={r}>{r}</li>)}</ul></details>
      </div>
    );
  return (
    <article className="ask-plan" data-testid="ai-summary">
      <p className="ask-plan__label"><strong>{o.label}</strong></p>
      {o.rotationKey && o.rotationKey.length > 0 && <p className="ask-hint">The plan calls your rotations: {o.rotationKey.join("; ")}.</p>}
      <p className="ask-hint">Written just now ({new Date(o.generatedAt).toUTCString()}) by {o.model}. It is not stored, so it is not a saved response.</p>
      <p className="ask-hint" role="note">{o.notice}</p>
      <div className="ask-plan__cards">
        {o.reply.sections.map((s, i) => (
          <section key={s.id + s.heading} className={`ask-card ask-plan__card ask-plan__card--${s.id}`} style={{ animationDelay: `${i * 160}ms` }}>
            <h4 className="ask-h3">{s.heading}</h4>
            {s.paragraphs.map((p, k) => (
              <div key={k}>
                <p>{p.text}</p>
                <details className="ask-facts"><summary>Based on</summary><ul>{p.facts.map((f) => <li key={f}><code>{f}</code></li>)}</ul></details>
              </div>
            ))}
          </section>
        ))}
      </div>
      {o.reply.notAvailable.length > 0 && <p className="ask-hint">Not available for this place: {o.reply.notAvailable.join(", ")}.</p>}
    </article>
  );
}
