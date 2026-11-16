import type { NlcdClass } from "./types";

export const NLCD_YEAR = 2021;

/** Official NLCD class legend (mrlc.gov "NLCD class legend and description"). Codes 51, 72, 73, 74 are Alaska-only. */
export const NLCD_CLASSES: Record<number, string> = {
  11: "Open Water",
  12: "Perennial Ice/Snow",
  21: "Developed, Open Space",
  22: "Developed, Low Intensity",
  23: "Developed, Medium Intensity",
  24: "Developed, High Intensity",
  31: "Barren Land (Rock/Sand/Clay)",
  41: "Deciduous Forest",
  42: "Evergreen Forest",
  43: "Mixed Forest",
  51: "Dwarf Scrub (Alaska only)",
  52: "Shrub/Scrub",
  71: "Grassland/Herbaceous",
  72: "Sedge/Herbaceous (Alaska only)",
  73: "Lichens (Alaska only)",
  74: "Moss (Alaska only)",
  81: "Pasture/Hay",
  82: "Cultivated Crops",
  90: "Woody Wetlands",
  95: "Emergent Herbaceous Wetlands",
};

/** Map the WMS PALETTE_INDEX to a class. Returns null for a code that is not in the legend. */
export function nlcdClassFromCode(code: number, year = NLCD_YEAR): NlcdClass | null {
  const name = NLCD_CLASSES[code];
  return name ? { code, name, year } : null;
}

/**
 * Parse the GetFeatureInfo JSON. "empty" = request answered but no pixel (outside the layer, e.g. outside the US);
 * "unknown" = a code that is not in the legend.
 */
export function parseNlcdFeatureInfo(json: string): { kind: "class"; value: NlcdClass } | { kind: "empty" } | { kind: "unknown"; code: number } {
  const body = JSON.parse(json) as { features?: { properties?: { PALETTE_INDEX?: number } }[] };
  const f = body.features?.[0];
  if (!f) return { kind: "empty" };
  const code = f.properties?.PALETTE_INDEX;
  if (typeof code !== "number") return { kind: "empty" };
  const value = nlcdClassFromCode(code);
  return value ? { kind: "class", value } : { kind: "unknown", code };
}
