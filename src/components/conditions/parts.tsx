import type { ReactNode } from "react";
import { DataBadge, type BadgeKind } from "./badges";
import type { LayerProblem } from "./models";

export type SectionId = "frost" | "soil" | "veg" | "map" | "land" | "ground" | "year" | "blocked";

export function SectionShell({ id, title, badges = [], label, children }: { id: SectionId; title: string; badges?: BadgeKind[]; label?: string; children: ReactNode }) {
  return (
    <section id={`cx-${id}`} className="cx-section" aria-labelledby={`cx-${id}-h`}>
      <header className="cx-section__head">
        <h2 id={`cx-${id}-h`} className="sh-h2 cx-section__title">{title}</h2>
        {(badges.length > 0 || label) && (
          <div className="cx-section__tags">
            {badges.map((b) => <DataBadge key={b} kind={b} />)}
            {label && <span className="cx-label">{label}</span>}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

export function Headline({ children }: { children: ReactNode }) {
  return <p className="cx-headline">{children}</p>;
}

export function More({ children, title = "What this means and how we know" }: { children: ReactNode; title?: string }) {
  return (
    <details className="cx-more">
      <summary>{title}</summary>
      <div className="cx-more__body">{children}</div>
    </details>
  );
}

export function Origin({ children }: { children: ReactNode }) {
  return <p className="cx-origin">{children}</p>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "caveat" }) {
  return <div className={`cx-notice cx-notice--${tone}`}>{children}</div>;
}

/** A layer that cannot be shown: what happened in plain words, the exact message, and a next step. Never a silent fallback. */
export function ProblemCard({ p }: { p: LayerProblem }) {
  const plain =
    p.kind === "no-coverage"
      ? "This data set does not cover this place, so nothing is shown for it and nothing is estimated in its place."
      : p.kind === "not-checked"
        ? "This check was not run for this place, so nothing is shown for it."
        : p.kind === "unavailable"
          ? "This cannot be worked out from the record we have, so nothing is shown."
          : "This part could not be loaded, so nothing is shown. The app never fills a gap with made-up numbers.";
  return (
    <div className={`cx-problem cx-problem--${p.kind}`} role="status">
      <p className="cx-problem__title">{p.title}</p>
      <p>{plain}</p>
      <p>
        Exact message: <code>{p.message}</code>
      </p>
      <p>
        <strong>Next step:</strong> {p.nextStep}
      </p>
    </div>
  );
}

export function SectionLoading({ title, slow, id }: { title: string; slow?: string; id: SectionId }) {
  return (
    <section id={`cx-${id}`} className="cx-section cx-loading" aria-busy="true" aria-labelledby={`cx-${id}-h`}>
      <h2 id={`cx-${id}-h`} className="sh-h2">{title}</h2>
      <p role="status" className="cx-loading__text">
        Loading this section.{slow ? ` ${slow}` : " Saved example places load at once."} Nothing is made up while you wait.
      </p>
      <div className="sh-skel cx-skel" aria-hidden="true"><span /></div>
    </section>
  );
}

export function SourceList({ sources }: { sources: { name: string; citation: string; url: string }[] }) {
  return (
    <ul className="cx-sources">
      {sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} rel="noreferrer">{s.name}</a>. {s.citation}
        </li>
      ))}
    </ul>
  );
}
