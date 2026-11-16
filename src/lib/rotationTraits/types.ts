/** One citation. url must be a document that was opened when the value was compiled. */
export type TraitSource = { title: string; url: string; page_or_table: string };

export type TraitStatus = "sourced" | "unknown";

/**
 * A trait value with its citation. status "unknown" means value is null and no source was found; it is shown as
 * "no sourced value" and never imputed. note is required when unknown (what was searched / why).
 */
export type TraitField<T> = {
  value: T | null;
  status: TraitStatus;
  source: TraitSource | null;
  note?: string;
  /** How the value was established: "explicit" (the source states it), "grouping" (the source's own table grouping). */
  basis?: "explicit" | "grouping";
  /** false when the value is defined differently from the same trait of other crops (rice p). Such values are not compared. */
  comparable?: boolean;
};

export type RootDepthM = { minM: number; maxM: number };
export type NCredit = { minLbPerAcre: number; maxLbPerAcre: number; unit: string; conditions: string };

export type TraitKey =
  | "family"
  | "nitrogenFixing"
  | "nCredit"
  | "rootDepthM"
  | "depletionFractionP"
  | "residueRole"
  | "soilStructureRole"
  | "forage"
  | "erosionCover"
  | "droughtToleranceQualitative";

export type CropTraitSet = {
  family: TraitField<string>;
  nitrogenFixing: TraitField<boolean>;
  nCredit: TraitField<NCredit>;
  rootDepthM: TraitField<RootDepthM>;
  depletionFractionP: TraitField<number>;
  residueRole: TraitField<string>;
  soilStructureRole: TraitField<string>;
  forage: TraitField<boolean>;
  erosionCover: TraitField<string>;
  droughtToleranceQualitative: TraitField<string>;
};

export const TRAIT_KEYS: TraitKey[] = [
  "family", "nitrogenFixing", "nCredit", "rootDepthM", "depletionFractionP",
  "residueRole", "soilStructureRole", "forage", "erosionCover", "droughtToleranceQualitative",
];

export type CropTraits = {
  id: string;
  name: string;
  scientificName: string;
  itisTsn: number;
  /** true when the crop is in data/crops/catalog.json (so the replay can judge its water use if every catalog value is sourced). */
  inCatalog: boolean;
  kind: "cash-crop" | "candidate" | "cover-crop";
  notes: string;
  traits: CropTraitSet;
};

export type RotationPrinciple = {
  statement: string;
  quotes: { text: string; source: TraitSource }[];
};

export type TraitsFile = {
  compiledOn: string;
  description: string;
  rotationPrinciple: RotationPrinciple;
  crops: CropTraits[];
};

/** Typed placeholder: market and price data need API keys that are not set up. No price, margin or income number exists in this app. */
export type MarketData = {
  status: "not-connected";
  reason: string;
  registerUrl: string;
};
