import type { ExplainSource } from "./types";

/**
 * Every page below was opened (read) while writing this module; see docs/explain.md for dates.
 * `cite(key, locator)` builds a source with the section where the statement is found.
 */
const BASE = {
  fao56Ch1: {
    title: "FAO Irrigation and Drainage Paper 56, Chapter 1: Introduction to evapotranspiration",
    publisher: "FAO (UN Food and Agriculture Organization)",
    url: "https://www.fao.org/4/x0490e/x0490e04.htm",
  },
  fao56Ch6: {
    title: "FAO Irrigation and Drainage Paper 56, Chapter 6: ETc, single crop coefficient (Kc)",
    publisher: "FAO (UN Food and Agriculture Organization)",
    url: "https://www.fao.org/4/x0490e/x0490e0b.htm",
  },
  ucanrEt: {
    title: "ET: Evapotranspiration and Plant Water Use",
    publisher: "UC Agriculture and Natural Resources (Center for Landscape and Urban Horticulture)",
    url: "https://ucanr.edu/site/center-landscape-urban-horticulture/et-evapotranspiration-and-plant-water-use",
  },
  nasaEoNdvi: {
    title: "Measuring Vegetation (NDVI and EVI)",
    publisher: "NASA Earth Observatory",
    url: "https://science.nasa.gov/earth/earth-observatory/measuring-vegetation-ndvi-evi",
  },
  powerMethod: {
    title: "NASA POWER methodology",
    publisher: "NASA Prediction Of Worldwide Energy Resources (POWER)",
    url: "https://power.larc.nasa.gov/docs/methodology/",
  },
  powerParams: {
    title: "NASA POWER parameter catalogue (community AG, daily)",
    publisher: "NASA Prediction Of Worldwide Energy Resources (POWER)",
    url: "https://power.larc.nasa.gov/api/system/manager/parameters?community=ag&temporal=daily",
  },
  merra2: {
    title: "MERRA-2",
    publisher: "NASA Global Modeling and Assimilation Office",
    url: "https://gmao.gsfc.nasa.gov/gmao-products/merra-2/",
  },
  smapMission: {
    title: "SMAP mission description",
    publisher: "NASA Jet Propulsion Laboratory",
    url: "https://smap.jpl.nasa.gov/mission/description/",
  },
  smapScience: {
    title: "SMAP (Soil Moisture Active Passive)",
    publisher: "NASA Science",
    url: "https://science.nasa.gov/mission/smap/",
  },
  ecostress: {
    title: "ECOSTRESS",
    publisher: "NASA Science",
    url: "https://science.nasa.gov/mission/ecostress/",
  },
  imerg: {
    title: "IMERG (Integrated Multi-satellitE Retrievals for GPM)",
    publisher: "NASA Global Precipitation Measurement mission",
    url: "https://gpm.nasa.gov/data/imerg",
  },
  landsatMissions: {
    title: "Landsat satellite missions",
    publisher: "USGS",
    url: "https://www.usgs.gov/landsat-missions/landsat-satellite-missions",
  },
  landsat8: {
    title: "Landsat 8",
    publisher: "USGS",
    url: "https://www.usgs.gov/landsat-missions/landsat-8",
  },
  terraModis: {
    title: "MODIS (Terra instruments)",
    publisher: "NASA Terra mission",
    url: "https://terra.nasa.gov/about/terra-instruments/modis",
  },
  hls: {
    title: "Harmonized Landsat Sentinel-2 (HLS)",
    publisher: "NASA Earthdata",
    url: "https://www.earthdata.nasa.gov/data/projects/hls",
  },
  daymet: {
    title: "Daymet: Daily Surface Weather Data on a 1-km Grid for North America, Version 4 R1",
    publisher: "NASA Earthdata catalog (ORNL DAAC)",
    url: "https://www.earthdata.nasa.gov/data/catalog/ornl-cloud-daymet-daily-v4r1-2129-4.1",
  },
  cocorahs: {
    title: "CoCoRaHS: About CoCoRaHS",
    publisher: "CoCoRaHS (Colorado Climate Center)",
    url: "https://www.cocorahs.org/",
  },
  nwsFrost: {
    title: "NWS Glossary: frost",
    publisher: "NOAA National Weather Service",
    url: "https://forecast.weather.gov/glossary.php?word=frost",
  },
  isuCorn: {
    title: "Corn Pollination: Effect of High Temperature and Stress",
    publisher: "Iowa State University Extension and Outreach (Integrated Crop Management)",
    url: "https://crops.extension.iastate.edu/encyclopedia/corn-pollination-effect-high-temperature-and-stress",
  },
  neh7: {
    title: "National Engineering Handbook Part 630, Chapter 7: Hydrologic Soil Groups (210-VI-NEH, January 2009)",
    publisher: "USDA Natural Resources Conservation Service (copy hosted by damtoolbox.org)",
    url: "https://www.damtoolbox.org/images/e/e9/NEH7.pdf",
  },
  efotgPhysical: {
    title: "Physical Properties (soil erosion factors Kw and Kf)",
    publisher: "USDA NRCS Field Office Technical Guide (eFOTG)",
    url: "https://efotg.sc.egov.usda.gov/references/Delete/2004-3-27/phypropb.htm",
  },
  nmsuA147: {
    title: "Agronomic Principles to Help with Farming During Drought Periods (Guide A-147)",
    publisher: "New Mexico State University Cooperative Extension Service",
    url: "https://pubs.nmsu.edu/_a/A147.pdf",
  },
  osuSorghum: {
    title: "Dryland cropping systems: Grain sorghum (EM 8794)",
    publisher: "Oregon State University Extension Service",
    url: "https://extension.oregonstate.edu/catalog/pub/em-8794-dryland-cropping-systems-grain-sorghum",
  },
  sareBenefits: {
    title: "Managing Cover Crops Profitably: Benefits of Cover Crops",
    publisher: "USDA SARE (Sustainable Agriculture Research and Education)",
    url: "https://www.sare.org/publications/managing-cover-crops-profitably/benefits-of-cover-crops/",
  },
  sareLegume: {
    title: "Managing Cover Crops Profitably: Legume Cover Crops",
    publisher: "USDA SARE (Sustainable Agriculture Research and Education)",
    url: "https://www.sare.org/publications/managing-cover-crops-profitably/legume-cover-crops/",
  },
  sarepDb: {
    title: "UC SAREP Cover Crops Database",
    publisher: "UC Sustainable Agriculture Research and Education Program (UC ANR)",
    url: "https://ucanr.edu/site/california-cover-crops-resources/uc-sarep-cover-crops-database",
  },
  statSem: {
    title: "Standard Error of the Mean (glossary)",
    publisher: "Online Statistics Education (Rice University and partners)",
    url: "https://onlinestatbook.com/glossary/sem.html",
  },
} as const;

export type SourceKey = keyof typeof BASE;

export function cite(key: SourceKey, locator: string): ExplainSource {
  return { ...BASE[key], locator };
}

export const SOURCE_BASE = BASE;
