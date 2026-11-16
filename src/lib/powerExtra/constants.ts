import type { ExtraField } from "./types";

/** Official parameter catalogue used as the citation source for names, units and definitions. */
export const POWER_EXTRA_PARAMETER_CATALOGUE_URL = "https://power.larc.nasa.gov/api/system/manager/parameters?community=ag&temporal=daily";

/**
 * The label every number from these layers carries. NASA POWER is reanalysis on a grid, not a farm sensor.
 * Identical wording to the rest of the app (CLAUDE.md).
 */
export const POWER_EXTRA_LABEL = "regional climate, about 50 km grid";

/** Shown wherever soil wetness appears: GWET* is a model product, not a soil probe. */
export const SOIL_MODELLED_NOTE =
  "Soil wetness here is modelled by the MERRA-2 reanalysis that NASA POWER serves, not measured in a field. It is a regional estimate.";

/** POWER parameter name -> field. Order is the order sent in the request. */
export const EXTRA_FIELD_BY_PARAMETER = {
  GWETROOT: "soilRootWetness",
  GWETTOP: "soilTopWetness",
  GWETPROF: "soilProfileWetness",
  T2MDEW: "dewPointC",
  TS: "skinTempC",
  EVLAND: "evapLandMm",
  PS: "pressureKPa",
  FROST_DAYS: "frostFlag",
} as const satisfies Record<string, ExtraField>;

export type PowerExtraParameter = keyof typeof EXTRA_FIELD_BY_PARAMETER;
export const POWER_EXTRA_PARAMETERS = Object.keys(EXTRA_FIELD_BY_PARAMETER) as PowerExtraParameter[];
export const EXTRA_FIELDS = Object.values(EXTRA_FIELD_BY_PARAMETER) as ExtraField[];

/** Units NASA POWER reports (verified against the real API v2.10.3). Anything else is an error, never converted. */
export const EXTRA_EXPECTED_UNITS: Record<ExtraField, string> = {
  soilRootWetness: "1",
  soilTopWetness: "1",
  soilProfileWetness: "1",
  dewPointC: "C",
  skinTempC: "C",
  evapLandMm: "mm/day",
  pressureKPa: "kPa",
  frostFlag: "Days",
};

/** Plain-English names used in messages shown to people. */
export const EXTRA_FIELD_LABEL: Record<ExtraField, string> = {
  soilRootWetness: "root-zone soil wetness",
  soilTopWetness: "surface soil wetness",
  soilProfileWetness: "profile soil wetness",
  dewPointC: "dew/frost point",
  skinTempC: "ground-surface temperature",
  evapLandMm: "land evaporation",
  pressureKPa: "surface pressure",
  frostFlag: "frost days",
};
