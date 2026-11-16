import Link from "next/link";
import type { SatelliteVsGround } from "@/lib/site/satellite";
import type { Layer, LayerStatus } from "@/lib/site/types";
import SourceList from "./SourceList";

const STATUS: Record<LayerStatus, { text: string; cls: string }> = {
  connected: { text: "In this app", cls: "st-tag--on" },
  "built-not-run": { text: "Built, never run (no key)", cls: "st-tag--off" },
  "not-connected": { text: "Not connected", cls: "st-tag--no" },
};

const FINDING_ANCHOR: Record<NonNullable<Layer["finding"]>, string> = {
  "rain-compare": "#finding-rain",
  greenness: "#finding-greenness",
  "land-records": "#finding-greenness",
};

function LayerCard({ l, i }: { l: Layer; i: number }) {
  const st = STATUS[l.status];
  return (
    <li style={{ display: "contents" }}>
      <article id={l.id} className="st-card" style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
        <h3>
          {l.name}
          <span className={`st-tag ${st.cls}`}>{st.text}</span>
        </h3>
        <p><span className="st-label">{l.kindLabel}</span>{l.plain}</p>
        <dl className="st-facts">
          <div><dt>One value covers</dt><dd>{l.resolution}</dd></div>
          <div><dt>Where it works</dt><dd>{l.coverage}</dd></div>
          <div><dt>What it can tell you</dt><dd>{l.canSay}</dd></div>
          <div><dt>What it cannot tell you</dt><dd>{l.cannotSay}</dd></div>
          <div><dt>In this app</dt><dd>{l.statusText}</dd></div>
        </dl>
        <ul className="st-links" aria-label={`Links for ${l.name}`}>
          {l.finding && <li><a href={FINDING_ANCHOR[l.finding]}>See what the saved data shows</a></li>}
          {l.links.map((k) => <li key={k.href}><Link href={k.href}>{k.label}</Link></li>)}
        </ul>
        <SourceList cites={l.cites} />
      </article>
    </li>
  );
}

export default function SatelliteView({ data }: { data: SatelliteVsGround }) {
  return (
    <>
      <section className="st-sec" aria-labelledby="sv-both-h">
        <h2 id="sv-both-h">Why this app uses both</h2>
        <div className="st-grid3">
          {data.bothSides.map((b) => (
            <article key={b.title} className="st-card">
              <h3>{b.title}</h3>
              <p>{b.text}</p>
              <SourceList cites={b.cites} />
            </article>
          ))}
        </div>
      </section>

      {data.sides.map((s) => (
        <section key={s.id} id={`side-${s.id}`} className="st-sec" aria-labelledby={`h-${s.id}`}>
          <div className="st-side">
            <h2 id={`h-${s.id}`}>{s.title}</h2>
            <p className="st-lede">{s.blurb}</p>
          </div>
          <ul className="st-cards">
            {s.layers.map((l, i) => <LayerCard key={l.id} l={l} i={i} />)}
          </ul>
        </section>
      ))}

      <section className="st-sec" aria-labelledby="sv-table-h">
        <h2 id="sv-table-h">All layers at a glance</h2>
        <div className="st-scroll" tabIndex={0} role="region" aria-label="All layers table, scrolls sideways on small screens">
          <table className="st-table">
            <caption className="sr-only">Each layer, how it is made, what one value covers, and whether this app uses it</caption>
            <thead>
              <tr><th scope="col">Layer</th><th scope="col">How it is made</th><th scope="col">One value covers</th><th scope="col">In this app</th></tr>
            </thead>
            <tbody>
              {data.layers.map((l) => (
                <tr key={l.id}>
                  <th scope="row"><a href={`#${l.id}`}>{l.name}</a></th>
                  <td>{l.kindLabel}</td>
                  <td>{l.resolution}</td>
                  <td><span className={`st-tag ${STATUS[l.status].cls}`}>{STATUS[l.status].text}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="st-sec" aria-labelledby="sv-gaps-h">
        <h2 id="sv-gaps-h">What we could not source or check</h2>
        <p className="st-lede">These are gaps in this page, listed so nothing is claimed that was not read.</p>
        <ul className="st-gaps">
          {data.gaps.map((g) => <li key={g}>{g}</li>)}
        </ul>
      </section>
    </>
  );
}
