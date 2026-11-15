import Link from "next/link";
import { DEMO_PINS } from "@/lib/demoPins";

const BackArrow = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function PlaceLinks({ label = "Try an example place" }: { label?: string }) {
  return (
    <nav className="places" aria-label={label}>
      <p className="places__label">{label}</p>
      <ul>
        {DEMO_PINS.map((d) => (
          <li key={d.id}>
            <Link className="demo-link" href={`/shift?lat=${d.lat.toFixed(4)}&lon=${d.lon.toFixed(4)}`}>{d.name}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PageTop({ title }: { title: string }) {
  return (
    <header className="sh-top">
      <div className="sh-top__inner">
        <Link href="/" className="sh-back"><BackArrow /> Back to the map</Link>
        <h1 className="sh-top__title">{title}</h1>
      </div>
    </header>
  );
}

/** Plain message state with a next step. `retryHref` renders a plain anchor so the page really reloads. */
export function Problem(props: { title: string; lines: string[]; exact?: string; nextStep?: string; retryHref?: string }) {
  return (
    <>
      <PageTop title={props.title} />
      <main className="sh-main">
        <section className="problem" role="alert">
          {props.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {props.exact && (
            <p>
              Exact message: <code>{props.exact}</code>
            </p>
          )}
          {props.nextStep && (
            <p>
              <strong>Next step:</strong> {props.nextStep}
            </p>
          )}
          <div className="problem__actions">
            {props.retryHref && (
              <a className="btn btn--primary" href={props.retryHref}>Try again</a>
            )}
            <Link className="btn btn--ghost" href="/">Back to the map</Link>
          </div>
        </section>
        <PlaceLinks />
      </main>
    </>
  );
}

export function LoadingState() {
  return (
    <div className="sh-loading" role="status" aria-live="polite">
      <header className="sh-hero sh-hero--calm">
        <div className="sh-hero__furrows" aria-hidden="true" />
        <div className="sh-hero__inner">
          <Link href="/" className="sh-back"><BackArrow /> Back to the map</Link>
          <p className="sh-hero__place">Rewinding the weather</p>
          <h1 className="sh-hero__title">Fetching about 40 years of daily weather from NASA</h1>
          <p className="sh-hero__sub">This can take a few seconds the first time for a new place. Nothing is made up while you wait.</p>
          <div className="sh-loading__bars" aria-hidden="true">
            {Array.from({ length: 30 }, (_, i) => (
              <span key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
        </div>
      </header>
      <main className="sh-main">
        <div className="sh-skel" aria-hidden="true">
          <span /><span /><span />
        </div>
      </main>
    </div>
  );
}
