/** Shapes of data/site/*.json. Every claim carries its sources; see docs/site-pages.md. */

export type SiteSource = { title: string; publisher: string; url: string; readOn: string };

export type WebCite = { kind: "web"; source: string; where: string; quote: string };
export type RepoCite = { kind: "repo"; path: string; where: string };
export type Cite = WebCite | RepoCite;

export type ResolvedWebCite = WebCite & { src: SiteSource };
export type ResolvedCite = ResolvedWebCite | RepoCite;

export type AppLink = { href: string; label: string };

export type GlossaryGroup = { id: string; title: string };

export type GlossaryTermRaw = {
  id: string;
  group: string;
  term: string;
  /** "world": defined by outside sources. "app": describes how this app counts, sourced to the repo's method documents. */
  kind: "world" | "app";
  plain: string;
  /** What this app does with it, from the repo documents. */
  appFact: string | null;
  appLinks: AppLink[];
  notTell: string;
  cites: Cite[];
};

export type GlossaryFile = {
  compiledOn: string;
  note: string;
  groups: GlossaryGroup[];
  sources: Record<string, SiteSource>;
  terms: GlossaryTermRaw[];
};

export type GlossaryTerm = Omit<GlossaryTermRaw, "cites"> & { cites: ResolvedCite[] };

export type LayerStatus = "connected" | "built-not-run" | "not-connected";
export type LayerSide = "space-or-model" | "ground" | "not-connected";

export type LayerRaw = {
  id: string;
  side: LayerSide;
  name: string;
  kindLabel: string;
  plain: string;
  resolution: string;
  coverage: string;
  canSay: string;
  cannotSay: string;
  status: LayerStatus;
  statusText: string;
  links: AppLink[];
  cites: Cite[];
  /** Which generated finding block (from saved data) belongs under this layer, if any. */
  finding: "rain-compare" | "greenness" | "land-records" | null;
};

export type SatelliteFile = {
  compiledOn: string;
  note: string;
  sides: { id: LayerSide; title: string; blurb: string }[];
  bothSides: { title: string; text: string; cites: Cite[] }[];
  layers: LayerRaw[];
  gaps: string[];
  sources: Record<string, SiteSource>;
};

export type Layer = Omit<LayerRaw, "cites"> & { cites: ResolvedCite[] };
export type BothSide = Omit<SatelliteFile["bothSides"][number], "cites"> & { cites: ResolvedCite[] };
