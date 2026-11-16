export type SmapObservation = {
  date: string;
  /** Only recommended-quality retrievals have a displayed value. */
  valueM3M3: number | null;
  rawValueM3M3: number | null;
  retrievalQualityFlag: number | null;
  quality: "recommended" | "not-recommended" | "missing";
  pixelLat: number;
  pixelLon: number;
  sourceGranule: string;
};

export type ImergObservation = {
  month: string;
  rateMmPerHour: number | null;
  /** Monthly mean rate multiplied by the actual number of hours in this month. */
  totalMm: number | null;
  randomErrorMmPerHour: number | null;
  qualityIndex: number | null;
  pixelLat: number;
  pixelLon: number;
  sourceGranule: string;
};

export type SavedLayer<T> = {
  status: "ok" | "no-data" | "error";
  requestedStart: string;
  requestedEnd: string;
  observations: T[];
  message?: string;
};

export type EarthdataFile = {
  schemaVersion: 1;
  pinId: string;
  lat: number;
  lon: number;
  fetchedAt: string;
  products: {
    smap: { shortName: "SPL3SMP_E"; version: "006"; collectionId: "C2938664763-NSIDC_CPRD"; units: "m3/m3"; grid: "EASE-Grid 2.0 Global EPSG:6933"; sampling: "native cell containing pin; no resampling" };
    imerg: { shortName: "GPM_3IMERGM"; version: "07"; collectionId: "C2723754851-GES_DISC"; rateUnits: "mm/hr"; totalUnits: "mm"; qualityIndexUnits: "Equivalent gauges per 2.5 deg box"; grid: "0.1 degree longitude/latitude" };
  };
  smap: SavedLayer<SmapObservation>;
  imerg: SavedLayer<ImergObservation>;
};

export type EarthdataResult =
  | { status: "saved"; data: EarthdataFile; originLine: string }
  | { status: "unavailable"; message: string };
