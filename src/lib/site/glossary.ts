import glossaryJson from "../../../data/site/glossary.json";
import { resolveCites } from "./resolve";
import type { GlossaryFile, GlossaryGroup, GlossaryTerm } from "./types";

const FILE = glossaryJson as unknown as GlossaryFile;

export type Glossary = { compiledOn: string; note: string; groups: (GlossaryGroup & { terms: GlossaryTerm[] })[]; terms: GlossaryTerm[] };

export function loadGlossary(file: GlossaryFile = FILE): Glossary {
  const terms: GlossaryTerm[] = file.terms.map((t) => ({ ...t, cites: resolveCites(t.cites, file.sources, `glossary term "${t.id}"`) }));
  const groups = file.groups.map((g) => ({ ...g, terms: terms.filter((t) => t.group === g.id) }));
  for (const t of terms) if (!file.groups.some((g) => g.id === t.group)) throw new Error(`glossary term "${t.id}" is in unknown group "${t.group}"`);
  return { compiledOn: file.compiledOn, note: file.note, groups, terms };
}
