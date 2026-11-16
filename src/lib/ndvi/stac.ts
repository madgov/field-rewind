import { COLLECTION, MAX_SCENE_CLOUD_PCT, STAC_TIMEOUT_MS, STAC_URL } from "./constants";
import { requestJson, withRetries, type HttpOptions } from "./http";

export type StacAsset = { href: string };
export type StacItem = {
  id: string;
  properties: Record<string, unknown> & { datetime?: string; platform?: string; "eo:cloud_cover"?: number; "proj:epsg"?: number };
  assets: Record<string, StacAsset & Record<string, unknown>>;
};
type StacPage = { features?: StacItem[]; links?: { rel: string; href?: string; method?: string; body?: Record<string, unknown> }[] };

export type SearchParams = { lat: number; lon: number; start: string; end: string; maxCloudPct?: number; pageLimit?: number };

/**
 * Scenes whose footprint contains the point, with scene cloud cover below the limit, ascending by date.
 * Follows "next" pages (POST) up to a hard cap so a runaway response cannot loop.
 */
export async function searchScenes(p: SearchParams, opts: HttpOptions = {}): Promise<StacItem[]> {
  const body: Record<string, unknown> = {
    collections: [COLLECTION],
    intersects: { type: "Point", coordinates: [p.lon, p.lat] },
    datetime: `${p.start}/${p.end}`,
    query: { "eo:cloud_cover": { lt: p.maxCloudPct ?? MAX_SCENE_CLOUD_PCT } },
    sortby: [{ field: "datetime", direction: "asc" }],
    limit: p.pageLimit ?? 100,
  };
  const out: StacItem[] = [];
  let url = `${STAC_URL}/search`;
  let next: Record<string, unknown> = body;
  for (let page = 0; page < 20; page++) {
    const res = await withRetries(() => requestJson<StacPage>(url, { method: "POST", body: next, timeoutMs: STAC_TIMEOUT_MS }, opts), opts);
    out.push(...(res.features ?? []));
    const link = res.links?.find((l) => l.rel === "next");
    if (!link?.href || !(res.features?.length ?? 0)) break;
    url = link.href;
    next = link.body ? { ...body, ...link.body } : body;
  }
  return out;
}
