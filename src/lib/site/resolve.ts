import type { Cite, ResolvedCite, SiteSource } from "./types";

/** Attach each web citation's source record. A citation naming an unknown source id is a data error and throws. */
export function resolveCites(cites: Cite[], sources: Record<string, SiteSource>, owner: string): ResolvedCite[] {
  return cites.map((c) => {
    if (c.kind === "repo") return c;
    const src = sources[c.source];
    if (!src) throw new Error(`${owner}: unknown source "${c.source}"`);
    return { ...c, src };
  });
}
