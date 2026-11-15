/** A value with its citation. value === null means "could not be sourced" (unknown). */
export type Sourced<T> = {
  value: T | null;
  /** Full citation, e.g. "FAO Irrigation and Drainage Paper 56, Table 12" */
  source: string;
  /** Page / table row / section where the value is printed, e.g. "Table 12, row 'Tomato'". */
  page: string;
  url?: string;
  /** Anything a reader must know: which region row was used, a range that was printed, etc. */
  note?: string;
};

export type Crop = {
  id: string;
  /** Plain-English name, e.g. "Processing tomato" */
  name: string;
  /** FAO-56 single crop coefficients */
  kc: { ini: Sourced<number>; mid: Sourced<number>; end: Sourced<number> };
  /** Growth stage lengths in days: initial, development, mid-season, late-season */
  stageDays: { ini: Sourced<number>; dev: Sourced<number>; mid: Sourced<number>; late: Sourced<number> };
  /** Planting window and the default planting date used in the replay, as "MM-DD". */
  planting: { windowStart: Sourced<string>; windowEnd: Sourced<string>; defaultDate: Sourced<string> };
  /** Daily maximum air temperature above which the crop is commonly reported to suffer heat stress, degrees C. */
  heatThresholdC: Sourced<number>;
  /** true when the season normally crosses 31 December (e.g. winter wheat planted in autumn). */
  spansNewYear: boolean;
};

export type CropCatalog = {
  /** ISO date the catalog was compiled */
  compiledOn: string;
  region: string;
  crops: Crop[];
};
