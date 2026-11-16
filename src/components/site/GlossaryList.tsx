import Link from "next/link";
import type { Glossary } from "@/lib/site/glossary";
import SourceList from "./SourceList";

export default function GlossaryList({ glossary }: { glossary: Glossary }) {
  return (
    <>
      <nav aria-label="Glossary sections">
        <ul className="st-index">
          {glossary.groups.map((g) => (
            <li key={g.id}><a href={`#group-${g.id}`}>{g.title} ({g.terms.length})</a></li>
          ))}
        </ul>
      </nav>
      {glossary.groups.map((g) => (
        <section key={g.id} id={`group-${g.id}`} className="st-sec" aria-labelledby={`h-${g.id}`}>
          <h2 id={`h-${g.id}`}>{g.title}</h2>
          <ul className="st-terms">
            {g.terms.map((t, i) => (
              <li key={t.id} style={{ display: "contents" }}>
                <article id={t.id} className="st-term" style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
                  <h3>
                    {t.term}
                    {t.kind === "app" && <span className="st-tag st-tag--app" title="Describes how this app counts">How this app counts</span>}
                  </h3>
                  <p>{t.plain}</p>
                  {t.appFact && (
                    <p><span className="st-label">In this app</span>{t.appFact}</p>
                  )}
                  <p><span className="st-label">What it does not tell you</span>{t.notTell}</p>
                  {t.appLinks.length > 0 && (
                    <ul className="st-links" aria-label={`Where ${t.term} appears`}>
                      {t.appLinks.map((l) => (
                        <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
                      ))}
                    </ul>
                  )}
                  <SourceList cites={t.cites} />
                </article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
