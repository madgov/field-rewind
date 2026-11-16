/** Types for the Field Rewind glossary and explainers. Pure data, no UI, no network. */

export interface ExplainSource {
  title: string;
  publisher: string;
  /** https URL of a page that was opened (read) when the text was written. */
  url: string;
  /** Section, heading or page where the supported statement is. */
  locator: string;
}

/** A named family or layer inside an entry (for example one satellite family). */
export interface ExplainDetail {
  name: string;
  text: string;
  /** true only when this app really uses the layer today. */
  usedByApp: boolean;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  /** 1 to 3 short sentences, plain English. */
  plainDefinition: string;
  /** 1 to 2 sentences: why a farmer should care. */
  whyItMatters: string;
  /** What in THIS app uses it (and what is not connected). */
  howWeUseIt: string;
  sources: ExplainSource[];
  relatedIds: string[];
  details?: ExplainDetail[];
}

export type RotationRoleId =
  | "nitrogen-fixing"
  | "cover-crop"
  | "deep-rooting"
  | "drought-tolerant";

export interface RotationRoleExplainer {
  role: RotationRoleId;
  label: string;
  /** How this role can contribute to long-term soil health, in plain words. */
  contribution: string;
  /** What to watch for. */
  limits: string;
  /** Glossary entry id with the full explanation. */
  entryId: string;
  sources: ExplainSource[];
}

export interface SourceComparisonKind {
  id: "satellite" | "reanalysis" | "interpolated-grid" | "ground";
  name: string;
  plain: string;
  seesWell: string;
  cannotSee: string;
  sources: ExplainSource[];
}

export interface AppUseRow {
  id: string;
  /** What the layers are used for in the app, in plain words. */
  usedFor: string;
  layers: string;
  /** Short note on the main limit of this row. */
  mainLimit: string;
}

export interface OwnComparison {
  id: string;
  /** Describes what is compared. The UI injects the measured numbers; none are stored here. */
  whatIsCompared: string;
  whatItDoesNotShow: string;
}

export interface SatelliteVsGround {
  title: string;
  intro: string;
  kinds: SourceComparisonKind[];
  cloudGaps: { text: string; sources: ExplainSource[] };
  calibration: { text: string; sources: ExplainSource[] };
  combining: { text: string; sources: ExplainSource[] };
  appUseTable: AppUseRow[];
  ownComparisons: OwnComparison[];
  notConnected: string;
}

export type StatementKind = "our-position" | "fact";

export interface LocalExpertiseStatement {
  id: string;
  kind: StatementKind;
  text: string;
  /** Required when kind is "fact". Not needed for "our-position". */
  sources?: ExplainSource[];
}

export interface JudgmentItem {
  id: string;
  label: string;
  kind: StatementKind;
  /** Why local knowledge matters here. */
  why: string;
  /** What the app does and does not tell you here. */
  appLimit: string;
  sources?: ExplainSource[];
}

export interface UncertaintyItem {
  id: string;
  heading: string;
  text: string;
  /** Which project doc states the rule this text describes. */
  basis: string;
}

export interface UncertaintyExplainer {
  title: string;
  intro: string;
  items: UncertaintyItem[];
  notClaimed: string[];
  sources: ExplainSource[];
}
