import type { NextConfig } from "next";

// Saved responses for the Field conditions layers (all read at runtime via process.cwd()). /shift and /replay read them too, for the
// "How we know" panel's saved-response dates.
const LAYER_DATA = ["./data/power-extra/**", "./data/ndvi/**", "./data/landform/**", "./data/ground-truth/**"];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Saved NASA POWER responses are read at runtime via process.cwd()/data/power. Tracing finds them
  // today by static analysis; this pins them in explicitly so a refactor cannot silently drop them.
  // CIMIS and OpenET saved responses are read the same way (data/cimis, data/openet). Both folders may be empty: the pages then show
  // the exact "not run yet" blocker instead of a chart. The patterns match nothing when a folder holds only .gitkeep, which is fine.
  outputFileTracingIncludes: {
    "/api/power": ["./data/power/*.json"],
    "/dev": ["./data/power/*.json"],
    "/shift": ["./data/power/*.json", "./data/cimis/*.json", "./data/openet/*.json", ...LAYER_DATA],
    "/replay": ["./data/power/*.json", "./data/cimis/*.json", "./data/openet/*.json", ...LAYER_DATA],
    "/conditions": ["./data/power/*.json", "./data/cimis/*.json", "./data/openet/*.json", ...LAYER_DATA],
  },
};

export default nextConfig;
