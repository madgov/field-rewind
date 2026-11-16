import type { ResolvedCite } from "@/lib/site/types";

/** The documents a statement was written from: the place read, the read date, and a short word-for-word quote. */
export default function SourceList({ cites, label = "Where this comes from" }: { cites: ResolvedCite[]; label?: string }) {
  if (cites.length === 0) return null;
  return (
    <details className="st-src">
      <summary>{label} ({cites.length})</summary>
      <ul>
        {cites.map((c, i) =>
          c.kind === "web" ? (
            <li key={i}>
              <a href={c.src.url} rel="noreferrer">{c.src.title}</a>, {c.src.publisher}.
              <small> Read {c.src.readOn}. Where: {c.where}.</small>
              <q>{c.quote}</q>
            </li>
          ) : (
            <li key={i}>
              This app&rsquo;s own record: <code>{c.path}</code>.<small> {c.where}.</small>
            </li>
          ),
        )}
      </ul>
    </details>
  );
}
