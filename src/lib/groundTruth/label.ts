import { formatUtc } from "../power/label";
import type { GroundOrigin, SourceInfo } from "./types";

/** One-line honest description of what this whole feature is. Use next to any ground-check display. */
export const GROUND_TRUTH_LABEL =
  "Ground check: two gridded climate products and local ground records, compared. Not an accuracy claim about any of them.";

export const DAYMET_SOURCE: SourceInfo = {
  name: "Daymet V4 R1 (ORNL DAAC), 1 km grid interpolated from ground weather stations",
  citation:
    "Thornton, M.M., R. Shrestha, Y. Wei, P.E. Thornton, S.-C. Kao, and B.E. Wilson. 2022. Daymet: Daily Surface Weather Data on a 1-km Grid for North America, Version 4 R1. ORNL DAAC, Oak Ridge, Tennessee, USA. https://doi.org/10.3334/ORNLDAAC/2129",
  url: "https://doi.org/10.3334/ORNLDAAC/2129",
  terms: "Openly shared without restriction under EOSDIS data use guidance; citation requested.",
};

export const COCORAHS_SOURCE: SourceInfo = {
  name: "CoCoRaHS (Community Collaborative Rain, Hail and Snow Network) volunteer rain gauge",
  citation: "CoCoRaHS, Colorado Climate Center, Colorado State University. https://www.cocorahs.org (data: data.cocorahs.org export service)",
  url: "https://www.cocorahs.org",
  terms: "CC BY 4.0 unless noted; acknowledge CoCoRaHS as the source when displaying data. Provided with no guarantee.",
};

export const CDL_SOURCE: SourceInfo = {
  name: "USDA NASS Cropland Data Layer (30 m satellite classification)",
  citation:
    "USDA National Agricultural Statistics Service Cropland Data Layer. Published crop-specific data layer. USDA-NASS, Washington, DC. https://nassgeodata.gmu.edu/CropScape/",
  url: "https://nassgeodata.gmu.edu/CropScape/",
  terms: "Public domain, provided as is; NASS does not warrant conclusions drawn from the data and users are solely responsible for interpretations.",
};

export const NLCD_SOURCE: SourceInfo = {
  name: "NLCD 2021 Land Cover (MRLC / USGS), 30 m",
  citation:
    "Multi-Resolution Land Characteristics (MRLC) Consortium, National Land Cover Database 2021 (USGS). https://www.mrlc.gov. Class names from the official NLCD class legend on mrlc.gov.",
  url: "https://www.mrlc.gov/data/legends/national-land-cover-database-class-legend-and-description",
  terms: "US government data, public. The exact dataset citation text was not verified from a page opened in this build.",
};

export const NWIS_SOURCE: SourceInfo = {
  name: "USGS National Water Information System, field measurements of depth to water (parameter 72019)",
  citation: "U.S. Geological Survey, USGS Water Data APIs (OGC API), field-measurements collection. https://api.waterdata.usgs.gov/ogcapi/v0/",
  url: "https://api.waterdata.usgs.gov/ogcapi/v0/",
  terms: "US government data, public.",
};

/** "Saved response from 15 Nov 2026, 06:33 UTC." for saved data, or "Fetched from <source> just now, ..." for live. */
export function groundOriginLine(layer: { origin: GroundOrigin; fetchedAt: string }, sourceShortName: string): string {
  const when = formatUtc(layer.fetchedAt);
  return layer.origin === "live" ? `Fetched from ${sourceShortName} just now, ${when}.` : `Saved response from ${when}.`;
}
