import type { ReplayResult } from "../replay/types";
import type { MarketData, TraitSource } from "../rotationTraits/types";

/** What the farmer can ask the comparison to favour. "income" is listed but not connected: it never enters a ranking. */
export type PriorityId = "water" | "soil" | "income" | "forage";

export const PRIORITY_LABEL: Record<PriorityId, string> = {
  water: "Conserve water",
  soil: "Improve soil structure and health",
  income: "Supplemental income",
  forage: "Forage",
};

export type Priorities = {
  /** The criteria the farmer chose. Ranking uses only these. Order does not matter; there are no weights. */
  selected: PriorityId[];
};

export type Constraints = {
  /** Seasonal water supply in mm. Must be the supply the replay was run at. */
  supplyMm: number;
  /** Crop ids the farmer cannot or will not grow (equipment, market preference). A plain exclusion list. */
  excludedCropIds?: string[];
};

export type RotationSpec = { name: string; sequence: string[] };

export type FactId =
  | "water-short"
  | "n-fixing-share"
  | "root-depth"
  | "family-diversity"
  | "forage-share"
  | "drought-proxy"
  | "ground-cover-notes";

/** One line of the facts table. Every line is traceable: `sources` lists the traits' citations, or `fromReplay` is true. */
export type FactRow = {
  id: FactId;
  /** Which priority this fact belongs to; "context" facts are shown but never ranked. */
  criterion: PriorityId | "context";
  label: string;
  /** Plain-English text generated from the numbers. Unknown values read "no sourced value". */
  display: string;
  /** The number used for ranking, or null when it cannot be computed without guessing. */
  value: number | null;
  /** Crops in the cycle with no sourced value for this fact (counted, never imputed). */
  missingCropIds: string[];
  /** Which direction ranks first: "lower" or "higher" is better. null for facts that are never ranked. */
  better: "lower" | "higher" | null;
  fromReplay: boolean;
  sources: TraitSource[];
};

export type RotationFacts = {
  name: string;
  sequence: string[];
  cropNames: string[];
  /** Set when the rotation contains a crop on the farmer's exclusion list. Excluded rotations are not ranked. */
  excludedBecause: string[];
  /** Crops in the sequence that have no traits record at all. */
  cropsWithoutTraits: string[];
  /** Crops in the sequence that are not usable in the replay (so no water result exists). */
  cropsNotReplayed: string[];
  facts: FactRow[];
  /** Why there is no replay result for this rotation, or null. */
  waterUnavailableReason: string | null;
};

export type RankEntry = {
  rotation: string;
  value: number | null;
  /** Competition rank (1, 1, 3 for a two-way tie for first). null when not ranked on this fact. */
  rank: number | null;
  tiedWith: string[];
};

export type FactRanking = {
  factId: FactId;
  label: string;
  better: "lower" | "higher";
  /** The rule in words. */
  rule: string;
  entries: RankEntry[];
};

export type CriterionEntry = {
  rotation: string;
  subRanks: { factId: FactId; rank: number | null }[];
  /** Unweighted mean of the sub-ranks that exist; null when none exist. */
  meanRank: number | null;
  basedOn: number;
  of: number;
  /** Position among the rotations ranked on this criterion (competition ranking of meanRank, lower first). */
  position: number | null;
  tiedWith: string[];
};

export type CriterionRanking = {
  priority: PriorityId;
  label: string;
  rule: string;
  entries: CriterionEntry[];
};

export type BalancedEntry = {
  rotation: string;
  positions: { priority: PriorityId; position: number | null }[];
  /** Unweighted mean of the positions; null unless the rotation has a position on every selected criterion. */
  meanPosition: number | null;
  position: number | null;
  tiedWith: string[];
  notRankedOn: PriorityId[];
};

export type BalancedView = {
  label: string;
  rule: string;
  /** Selected criteria left out of the average because no rotation could be ranked on them. */
  droppedCriteria: PriorityId[];
  entries: BalancedEntry[];
};

export type Comparison = {
  supplyMm: number;
  selected: PriorityId[];
  /** Selected priorities that cannot be ranked, with the reason (supplemental income). */
  notRanked: { priority: PriorityId; reason: string }[];
  rotations: RotationFacts[];
  factRankings: FactRanking[];
  criterionRankings: CriterionRanking[];
  /** Present only when the farmer selected two or more rankable criteria. */
  balanced: BalancedView | null;
  warnings: string[];
  marketData: MarketData;
};

export type CompareInput = {
  rotations: RotationSpec[];
  replay: ReplayResult;
  priorities: Priorities;
  constraints: Constraints;
};

export type JudgmentKind =
  | "unknown-traits"
  | "outside-california"
  | "supply-sensitivity"
  | "not-in-replay"
  | "excluded"
  | "ties"
  | "income-not-connected"
  | "rice-p"
  | "supply-mismatch";

export type JudgmentPoint = { kind: JudgmentKind; rotation: string | null; text: string };

export type SupplyCheck = {
  rotation: string;
  baseSupplyMm: number;
  lowSupplyMm: number;
  highSupplyMm: number;
  /** Seasons judged at all three supplies. */
  seasonsCompared: number;
  /** Seasons green at the chosen supply that are red at 90 percent of it. */
  turnRedAtLow: number;
  /** Seasons red at the chosen supply that are green at 110 percent of it. */
  turnGreenAtHigh: number;
  /** Years short in the last decade at low / base / high supply. */
  lastDecadeShort: { low: number; base: number; high: number };
  anyChange: boolean;
};

export type SupplySensitivity = { available: true; checks: SupplyCheck[] } | { available: false; reason: string };
