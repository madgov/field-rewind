import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Saved NASA POWER responses are read at runtime via process.cwd()/data/power. Tracing finds them
  // today by static analysis; this pins them in explicitly so a refactor cannot silently drop them.
  outputFileTracingIncludes: {
    "/api/power": ["./data/power/*.json"],
    "/dev": ["./data/power/*.json"],
    "/shift": ["./data/power/*.json"],
    "/replay": ["./data/power/*.json"],
  },
};

export default nextConfig;
