export type NdviStatus = "ok" | "partial" | "no-coverage" | "error";
export type NdviOrigin = "live" | "cache" | "saved";

export type NdviSource = { name: string; citation: string; url: string };

/** One clear-sky Landsat observation of the pixel containing the pin. */
export type NdviObservation = {
  /** ISO date YYYY-MM-DD (UTC acquisition date) */
  date: string;
  /** NDVI, -1..1 */
  ndvi: number;
  /** "Landsat 5" | "Landsat 7" | "Landsat 8" | "Landsat 9" */
  satellite: string;
  sceneId: string;
};

export type NdviCounts = {
  /** Scenes returned by the search (after the scene cloud filter). */
  scenesFound: number;
  /** Scenes whose pixels were read successfully. */
  scenesRead: number;
  /** Scenes where the pin pixel was clear (these become observations). */
  clear: number;
  /** Scenes read but the pin pixel was masked (cloud, shadow, snow, fill, out-of-range). */
  masked: number;
  /** Scenes that could not be read (network failure after retries). */
  failed: number;
  /** Scenes skipped because of the live-path scene cap. */
  skippedByCap: number;
};

export type NdviSeriesResult = {
  status: NdviStatus;
  lat: number;
  lon: number;
  pinId?: string;
  origin: NdviOrigin;
  /** ISO time the data was fetched from the Planetary Computer / Landsat archive. */
  fetchedAt: string;
  units: string;
  label: string;
  sources: NdviSource[];
  /** Requested period. */
  period: { start: string; end: string } | null;
  /** Clear observations, sorted by date. One per date and satellite. */
  observations: NdviObservation[];
  satellites: string[];
  counts: NdviCounts;
  /** Plain-English notes (scene cap, failed reads, mixed satellites...). */
  notes: string[];
  message?: string;
};

/** A small window of real NDVI around the pin for one date, for drawing a map overlay. */
export type NdviGrid = {
  date: string;
  satellite: string;
  sceneId: string;
  /** rows north to south, columns west to east; null = masked by the QA band. Rounded to 3 decimals. */
  ndvi: (number | null)[][];
  rows: number;
  cols: number;
  /** Axis-aligned lon/lat bounds of the window (outer pixel edges). */
  bounds: { west: number; south: number; east: number; north: number };
  /** The same window in the scene's projected coordinates, metres. */
  crsBounds: { xMin: number; yMin: number; xMax: number; yMax: number };
  crs: string;
  pixelSizeM: number;
  /** Fraction of pixels in the window that are clear. */
  validFraction: number;
};

export type NdviGridsFile = {
  pinId: string;
  lat: number;
  lon: number;
  fetchedAt: string;
  units: string;
  label: string;
  sources: NdviSource[];
  windowPixels: number;
  grids: NdviGrid[];
};

export type NdviGridResult = {
  status: "ok" | "error";
  origin: NdviOrigin;
  fetchedAt: string | null;
  label: string;
  availableDates: string[];
  requestedDate?: string;
  /** Days between the requested date and the grid returned (0 = exact). */
  daysOff?: number;
  grid?: NdviGrid;
  message?: string;
};

/** Shape of data/ndvi/<pin>.json */
export type NdviSavedFile = {
  pinId: string;
  lat: number;
  lon: number;
  fetchedAt: string;
  period: { start: string; end: string };
  units: string;
  label: string;
  sources: NdviSource[];
  counts: NdviCounts;
  notes: string[];
  observations: NdviObservation[];
};
