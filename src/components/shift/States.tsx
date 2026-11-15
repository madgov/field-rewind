import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_PINS } from "@/lib/demoPins";
import { OFFLINE_MESSAGE } from "@/lib/power/offline";
import type { PowerResult } from "@/lib/types";
import { MAX_MISSING_DAYS_PER_YEAR } from "@/lib/shift/compute";
import { MAX_MISSING_SEASON_DAYS } from "@/lib/replay/types";
import { EXAMPLE_FARM_LABEL, exampleFarmHref } from "../replay/exampleFarm";

const BackArrow = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function PlaceLinks({ label = "Try an example place", basePath = "/shift" }: { label?: string; basePath?: string }) {
  return (
    <nav className="places" aria-label={label}>
      <p className="places__label">{label}</p>
      <ul>
        {DEMO_PINS.map((d) => (
          <li key={d.id}>
            <Link className="demo-link" href={`${basePath}?lat=${d.lat.toFixed(4)}&lon=${d.lon.toFixed(4)}`}>{d.name}</Link>
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

export function ExampleFarmLink({ primary = false }: { primary?: boolean }) {
  return (
    <Link className={`btn ${primary ? "btn--primary" : "btn--ghost"} example-farm-link`} href={exampleFarmHref()}>
      {EXAMPLE_FARM_LABEL}
    </Link>
  );
}

/** Plain message state with a next step. `retryHref` renders a plain anchor so the page really reloads. */
export function Problem(props: { title: string; lines: string[]; exact?: string; nextStep?: string; retryHref?: string; basePath?: string }) {
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
            <ExampleFarmLink primary={!props.retryHref} />
            <Link className="btn btn--ghost" href="/">Back to the map</Link>
          </div>
        </section>
        <PlaceLinks basePath={props.basePath} />
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
          <p className="sh-hero__sub">The first time for a new grid square this can take many seconds, because the whole record is fetched live from NASA. Nothing is made up while you wait.</p>
          <p className="sh-hero__sub">Next step: wait here, or use <Link href={exampleFarmHref()}>{EXAMPLE_FARM_LABEL}</Link> to see a saved response straight away.</p>
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

const isOfflineMessage = (m: string | undefined) => m === OFFLINE_MESSAGE;
const isTimeout = (m: string | undefined) => /timed out|timeout/i.test(m ?? "");

/**
 * Screen for a POWER result that cannot be shown at all (status "error" or "no-coverage"), or null when the page can go on.
 * Says what failed in plain words and offers a next step. Never falls back to saved or made-up data.
 */
export function powerProblemScreen(power: Pick<PowerResult, "status" | "message">, opts: { basePath?: string; retryHref: string; what: "result" | "replay" }): ReactNode {
  if (power.status === "error") {
    const offline = isOfflineMessage(power.message);
    const what = isTimeout(power.message)
      ? "NASA POWER took too long to answer, so the request was stopped."
      : offline
        ? "This copy of the app is running in offline mode, so it may not contact NASA, and this spot has no saved response."
        : "NASA POWER did not give back a usable weather history.";
    return (
      <Problem
        basePath={opts.basePath}
        title="NASA POWER could not give us the weather history"
        lines={[what, `No ${opts.what} is shown, because the app never fills the gap with made-up numbers.`]}
        exact={power.message ?? "NASA POWER returned an error with no message."}
        nextStep={offline ? `Use "${EXAMPLE_FARM_LABEL}", or pick one of the saved example places below. Both work without a connection.` : `Press Try again in a moment, or use "${EXAMPLE_FARM_LABEL}", which uses a saved response and needs no connection.`}
        retryHref={offline ? undefined : opts.retryHref}
      />
    );
  }
  if (power.status === "no-coverage") {
    return (
      <Problem
        basePath={opts.basePath}
        title="NASA POWER has no data for this spot"
        lines={["NASA POWER returned no daily weather values for this location."]}
        exact={power.message ?? undefined}
        nextStep={`Pick another spot on land on the map, or use "${EXAMPLE_FARM_LABEL}", which uses a saved response.`}
      />
    );
  }
  return null;
}

/** Shown above the results when status is "partial": what is missing, how it is treated, and what to do next. */
export function PartialNotice({ power, mode }: { power: Pick<PowerResult, "missing" | "coverage" | "message">; mode: "shift" | "replay" }) {
  const n = power.missing.anyField;
  const total = power.missing.totalDays;
  const treated =
    mode === "shift"
      ? `A year with more than ${MAX_MISSING_DAYS_PER_YEAR} missing days is hatched in the year-by-year stripes and left out of the averages. Missing days are never filled in.`
      : `A season with more than ${MAX_MISSING_SEASON_DAYS} days missing a crop water demand value, or more than ${MAX_MISSING_SEASON_DAYS} days missing a rainfall value, is grey and not judged either way: it counts as neither short nor covered. Missing days are never filled in.`;
  return (
    <section className="partial-notice" role="status" aria-labelledby="partial-h">
      <h2 id="partial-h" className="partial-notice__title">Some of the weather record is missing</h2>
      <p>
        {n.toLocaleString("en-US")} of {total.toLocaleString("en-US")} days have at least one missing value
        {power.coverage ? `, in the record from ${power.coverage.start} to ${power.coverage.end}` : ""}. {treated}
      </p>
      {power.message && <p>{power.message}</p>}
      <p>
        <strong>Next step:</strong> read the results with that in mind, try a pin a little way from this one, or use{" "}
        <Link href={exampleFarmHref()}>{EXAMPLE_FARM_LABEL}</Link>.
      </p>
    </section>
  );
}
