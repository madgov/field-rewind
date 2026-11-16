import { cacheLife } from "next/cache";
import { loadFindings } from "./findings";

/**
 * The saved files only change with a rebuild, so the page reads them once at build time ("use cache", as src/app/dev/page.tsx does)
 * and needs no runtime file tracing. Kept apart from findings.ts so the unit tests can call the plain loader without Next's cache runtime.
 */
export async function loadFindingsCached() {
  "use cache";
  cacheLife("max");
  return loadFindings();
}
