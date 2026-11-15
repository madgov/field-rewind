import type { NextConfig } from "next";

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
    "/shift": ["./data/power/*.json", "./data/cimis/*.json", "./data/openet/*.json"],
    "/replay": ["./data/power/*.json", "./data/cimis/*.json", "./data/openet/*.json"],
  },
};

export default nextConfig;
