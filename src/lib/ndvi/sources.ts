import { NDVI_UNITS } from "./constants";
import type { NdviSource } from "./types";

export const NDVI_LABEL =
  "Satellite vegetation index (NDVI) from Landsat: one 30 m pixel at the pin, a real satellite observation. It is not a field boundary and not a sensor in your field.";

export const NDVI_GRID_LABEL =
  "Real Landsat NDVI for the area within about 300 m of the pin (30 m pixels). It shows where it is greener or less green around the pin on that date. It is not a field boundary.";

export const NDVI_UNITS_LABEL = NDVI_UNITS;

export const NDVI_SOURCES: NdviSource[] = [
  {
    name: "USGS Landsat Collection 2 Level-2 surface reflectance (Landsat 5, 7, 8, 9)",
    citation:
      "U.S. Geological Survey, Landsat Collection 2 Level-2 Science Products (surface reflectance scale 0.0000275, offset -0.2; QA_PIXEL bit flags). Public domain; no restrictions on use.",
    url: "https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products",
  },
  {
    name: "Microsoft Planetary Computer (STAC search and anonymous read access)",
    citation: "Microsoft Planetary Computer, collection landsat-c2-l2: STAC API and Azure Blob Storage hosting of the USGS Landsat Collection 2 Level-2 archive.",
    url: "https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2",
  },
];

export const MODIS_SOURCE: NdviSource = {
  name: "MODIS MOD13Q1 v6.1 NDVI, 250 m, 16-day composite (ORNL DAAC MODIS web service)",
  citation:
    "ORNL DAAC. MODIS and VIIRS Land Products Global Subsetting and Visualization Tool. Didan, K. (2021) MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m SIN Grid V061, NASA LP DAAC.",
  url: "https://modis.ornl.gov/globalsubset/",
};

export function formatUtcDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${iso} (unreadable date)`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

export type NdviOriginInfo = { origin: "live" | "cache" | "saved"; fetchedAt: string };

/** The one provenance wording for NDVI data. Only origin "live" may say it was fetched just now. */
export function ndviOriginLine(r: NdviOriginInfo): string {
  const when = formatUtcDate(r.fetchedAt);
  return r.origin === "live" ? `Fetched from Landsat (USGS, via Microsoft Planetary Computer) just now, ${when}.` : `Saved response from ${when}.`;
}
