import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_LINKS } from "./links";

/** Shared frame for the reference pages: animated hero (same look as the other pages), main column and footer. */
export default function SiteShell(props: { kicker: string; title: string; sub: string; chips: string[]; currentHref: string; children: ReactNode }) {
  return (
    <>
      <header className="sh-hero sh-hero--calm st-hero">
        <div className="sh-hero__furrows" aria-hidden="true" />
        <div className="sh-hero__inner">
          <Link href="/" className="sh-back">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to the map
          </Link>
          <p className="st-hero__kicker">{props.kicker}</p>
          <h1 className="sh-hero__title">{props.title}</h1>
          <p className="sh-hero__sub">{props.sub}</p>
          <ul className="sh-hero__chips">
            {props.chips.map((c, i) => (
              <li key={c} className={`chip ${i === 0 ? "chip--strong" : ""}`}>{c}</li>
            ))}
          </ul>
          <ul className="st-hero__links" aria-label="Reference pages">
            {SITE_LINKS.filter((l) => l.href !== props.currentHref).map((l) => (
              <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
            ))}
          </ul>
        </div>
      </header>
      <main className="st-main">{props.children}</main>
      <footer className="footer sh-footer st-footer">
        <p>Every statement here is sourced. Where a source could not be opened, the page says so instead of guessing.</p>
        <Link href="/">Back to the map</Link>
      </footer>
    </>
  );
}
