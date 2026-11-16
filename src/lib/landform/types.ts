/** Result and data types for the soil, terrain and erosion layer. Plain data only (JSON-safe). */

export type LandformOrigin = "live" | "saved" | "cache";

/** Raw NASADEM window as read from the cloud-optimised GeoTIFF. Row-major, row 0 is the northern row. */
export type TerrainRaw = {
  /** STAC item id of the 1x1 degree tile, e.g. NASADEM_HGT_n37w122 */
  tileId: string;
  stacSearchUrl: string;
  /** Asset URL WITHOUT the SAS read token (the token is never saved). */
  assetUrl: string;
  fetchedAt: string;
  pinLat: number;
  pinLon: number;
  /** Window size in samples (rows = cols = grid size + 2: one extra ring for the Horn 3x3 neighbourhood). */
  windowRows: number;
  windowCols: number;
  /** Pixel size in degrees (positive numbers). */
  resDegLon: number;
  resDegLat: number;
  /** Outer edge of the window (west edge of column 0 and north edge of row 0). */
  windowWest: number;
  windowNorth: number;
  /** Elevation in metres. */
  elevationM: number[];
  /** No-data value reported by the GeoTIFF (null if none declared). */
  noData: number | null;
};

export type TerrainGrid = {
  rows: number;
  cols: number;
  /** Sample spacing in arc-seconds (1 for NASADEM). */
  cellArcSec: number;
  /** Outer edges of the grid (cell edges, not cell centres), for drawing an image overlay. */
  bounds: { west: number; south: number; east: number; north: number };
  centerLat: number;
  centerLon: number;
  cellSizeM: { northSouth: number; eastWest: number };
  /** Row-major, row 0 = north. Metres above the NASADEM vertical datum (EGM96 geoid). */
  elevationM: number[];
  /** Horn slope, degrees from horizontal. */
  slopeDeg: number[];
  /** Compass direction the slope faces (downslope), degrees clockwise from north; null on flat cells. */
  aspectDeg: Array<number | null>;
};

export type TerrainSummary = {
  centerElevationM: number;
  centerSlopeDeg: number;
  centerSlopePct: number;
  centerAspectDeg: number | null;
  minElevationM: number;
  maxElevationM: number;
  /** max minus min elevation inside the grid */
  reliefM: number;
  medianSlopePct: number;
  p90SlopePct: number;
  /** side length of the grid in metres, north-south and east-west */
  extentM: { northSouth: number; eastWest: number };
};

export type TerrainResult =
  | {
      status: "ok";
      origin: LandformOrigin;
      fetchedAt: string;
      tileId: string;
      assetUrl: string;
      summary: TerrainSummary;
      /** Present for live results and when the saved grid file is read; omitted by loadSavedLandform. */
      grid?: TerrainGrid;
    }
  | { status: "error"; message: string };

export type SoilHorizon = {
  name: string | null;
  topCm: number;
  bottomCm: number;
  sandPct: number | null;
  siltPct: number | null;
  clayPct: number | null;
  /** organic matter, percent by weight */
  omPct: number | null;
  /** available water capacity, cm of water per cm of soil (volume fraction) */
  awc: number | null;
  /** Kf erodibility factor, whole-soil-free fine fraction */
  kf: number | null;
  /** saturated hydraulic conductivity, micrometres per second */
  ksatUmPerS: number | null;
  ph: number | null;
};

export type SoilComponent = {
  cokey: string;
  name: string;
  pct: number;
  slopePct: number | null;
  drainageClass: string | null;
  hydgrp: string | null;
  taxClass: string | null;
  horizons: SoilHorizon[];
};

export type SdaRaw = {
  fetchedAt: string;
  pinLat: number;
  pinLon: number;
  endpoint: string;
  mukeyQuery: string;
  /** Parsed JSON body of the map unit lookup (JSON+COLUMNNAME). */
  mukeyResponse: unknown;
  componentQuery: string | null;
  componentResponse: unknown | null;
};

export type TextureClass =
  | "sand" | "loamy sand" | "sandy loam" | "loam" | "silt loam" | "silt"
  | "sandy clay loam" | "clay loam" | "silty clay loam" | "sandy clay" | "silty clay" | "clay";

export type ProfileAwc = {
  /** mm of plant-available water in the top 100 cm, weighted by component percentage */
  mm: number;
  /** components that contributed, with their own value */
  perComponent: Array<{ name: string; pct: number; mm: number; coveredCm: number; depthCm: number }>;
  /** percent of listed components that contributed (their pct summed / all listed pct summed) */
  coveragePct: number;
  /** true when any contributing component has fewer than 100 cm of horizons with an AWC value in the top 100 cm */
  shallowOrIncomplete: boolean;
};

export type SoilDerived = {
  dominantName: string;
  dominantPct: number;
  topHorizon: { name: string | null; topCm: number; bottomCm: number } | null;
  sandPct: number | null;
  siltPct: number | null;
  clayPct: number | null;
  textureClass: TextureClass | null;
  omTopPct: number | null;
  kfTop: number | null;
  hydgrp: string | null;
  drainageClass: string | null;
  mappedSlopePct: number | null;
  profileAwc: ProfileAwc | null;
};

export type SoilResult =
  | {
      status: "ok";
      origin: LandformOrigin;
      fetchedAt: string;
      mukey: string;
      muName: string;
      components: SoilComponent[];
      derived: SoilDerived;
    }
  | { status: "no-coverage"; origin: LandformOrigin; fetchedAt: string; message: string }
  | { status: "error"; message: string };

export type ErosionIndicator = {
  /** Slope used, percent (from NASADEM at the pin cell). */
  slopePct: number | null;
  slopeBand: { label: string; fromPct: number; toPct: number | null } | null;
  kf: number | null;
  /** 1-based position of Kf among the 14 NRCS Kf classes (0.02 ... 0.64), or null */
  kfClassRank: number | null;
  /** Always null: no published combined convention could be cited, so none is invented. */
  combinedClass: null;
  label: string;
};

export type LandUseCheck = {
  source: string;
  year: number;
  url: string;
  value: string;
  category: string | null;
  note?: string;
  fetchedAt: string;
};

export type LandformResult = {
  status: "ok" | "partial" | "error";
  lat: number;
  lon: number;
  origin: LandformOrigin;
  /** oldest fetch time among the parts */
  fetchedAt: string | null;
  message?: string;
  terrain: TerrainResult;
  soil: SoilResult;
  erosion: ErosionIndicator | null;
  /** Only for saved sample points where a land-use check was run. */
  landUse?: LandUseCheck;
};

/** Format of data/landform/<id>.json */
export type LandformSavedFile = {
  id: string;
  kind: "demo-pin" | "sample-point";
  name: string;
  lat: number;
  lon: number;
  fetchedAt: string;
  sda: SdaRaw;
  terrain: Omit<TerrainRaw, "elevationM"> & { gridFile: string };
  landUse?: LandUseCheck;
};

/** Format of data/landform/<id>-grid.json */
export type LandformGridFile = { id: string; terrain: TerrainRaw };
