/** Provenance wording for the landform layer. Same rule as the POWER layer: only "live" may say it was fetched just now. */
import { formatUtc } from "../power/label";
import type { LandformOrigin } from "./types";

export const TERRAIN_SOURCE_LABEL = "NASADEM elevation, NASA's reprocessing of SRTM radar data, 1 arc-second (about 30 m) surface model";
export const SOIL_SOURCE_LABEL = "USDA NRCS SSURGO soil survey via Soil Data Access (United States only)";
export const TERRAIN_CAVEAT = "NASADEM is a surface model: buildings and tree canopy raise it, so slope on developed or wooded ground is not farm slope. One cell is about 30 m, so small ditches and field edges are not resolved.";
export const SOIL_US_ONLY_NOTE = "SSURGO covers the United States only.";

/** One line naming both sources, resolution and the US-only limit. */
export const LANDFORM_LABEL = `Terrain: ${TERRAIN_SOURCE_LABEL}. Soil: ${SOIL_SOURCE_LABEL}. Erosion: indicator from slope and soil erodibility, not a soil-loss prediction.`;

export type LandformOriginInfo = { origin: LandformOrigin; fetchedAt: string };

/** "Saved response from 15 Nov 2026, 06:33 UTC." for saved and cached data; "Fetched just now, ..." only for live. */
export function landformOriginLine(info: LandformOriginInfo): string {
  const when = formatUtc(info.fetchedAt);
  return info.origin === "live" ? `Fetched just now, ${when}.` : `Saved response from ${when}.`;
}

/** Origin line plus what the data is, for chips and the printed report. */
export function landformDataLabel(info: LandformOriginInfo): string {
  return `${landformOriginLine(info).replace(/\.$/, "")} (NASADEM 30 m surface model; USDA SSURGO soil survey)`;
}
