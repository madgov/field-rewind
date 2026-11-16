export const SMAP_COLLECTION = "C2938664763-NSIDC_CPRD";
export const IMERG_COLLECTION = "C2723754851-GES_DISC";
export const SMAP_SOURCE = {
  name: "SMAP SPL3SMP_E, Version 6",
  url: "https://nsidc.org/data/spl3smp_e/versions/6",
  guide: "https://nsidc.org/sites/default/files/documents/user-guide/spl3smp_e-v006-userguide.pdf",
  citation: "O'Neill et al., SMAP Enhanced L3 Radiometer Global and Polar Grid Daily 9 km EASE-Grid Soil Moisture, Version 6. NASA NSIDC DAAC. DOI: 10.5067/M20OXIZHY3RJ.",
  resolution: "Posted to a 9 km grid from a radiometer footprint of about 36 km; not a field sensor.",
};
export const IMERG_SOURCE = {
  name: "GPM IMERG Final monthly, Version 07",
  url: "https://www.earthdata.nasa.gov/data/catalog/ges-disc-gpm-3imergm-07",
  guide: "https://gpm.nasa.gov/sites/default/files/2023-07/IMERG_TechnicalDocumentation_final_230713.pdf",
  citation: "Huffman et al., GPM IMERG Final Precipitation L3 1 month 0.1 degree x 0.1 degree V07, NASA GES DISC. DOI: 10.5067/GPM/IMERG/3B-MONTH/07.",
  resolution: "One 0.1 degree grid cell, monthly; merged satellite and rain-gauge estimate, not a field rain gauge.",
};
export const EARTHDATA_LIMIT = "These are dated observation snapshots, not a forecast or a 40-season record. They do not change the water replay or establish crop survival, yield or soil-health improvement.";
