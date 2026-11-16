/**
 * NASADEM client. NASADEM is NASA's reprocessing of SRTM radar data (about 1 arc-second, 30 m spacing). It is a SURFACE
 * model (radar reflects off canopy and roofs), not bare earth. Tiles are served as cloud-optimised GeoTIFFs by the
 * Microsoft Planetary Computer (anonymous; a short-lived read token is requested from its SAS endpoint).
 * Server-side only.
 */
import { fromUrl } from "geotiff";
import { GRID_SIZE } from "./terrain";
import type { TerrainRaw } from "./types";

export const STAC_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
export const SAS_TOKEN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token/nasadem";
export const USER_AGENT = "field-rewind";
export const NASADEM_TIMEOUT_MS = 45_000;

export type TerrainFetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class TerrainFetchError extends Error {}

type StacItem = { id: string; assets?: { elevation?: { href?: string } } };

async function fetchJson(f: TerrainFetchLike, url: string, init: Parameters<TerrainFetchLike>[1], what: string): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NASADEM_TIMEOUT_MS);
  try {
    const res = await f(url, { ...init, signal: ac.signal });
    if (!res.ok) throw new TerrainFetchError(`${what} answered HTTP ${res.status}.`);
    return await res.json();
  } catch (e) {
    if (e instanceof TerrainFetchError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new TerrainFetchError(`${what} did not answer within ${NASADEM_TIMEOUT_MS / 1000} seconds.`);
    throw new TerrainFetchError(`${what} could not be reached (${e instanceof Error ? e.message : String(e)}).`);
  } finally {
    clearTimeout(timer);
  }
}

export async function findNasademItem(lat: number, lon: number, f: TerrainFetchLike): Promise<{ id: string; href: string }> {
  const body = JSON.stringify({ collections: ["nasadem"], intersects: { type: "Point", coordinates: [lon, lat] }, limit: 1 });
  const json = (await fetchJson(f, STAC_SEARCH_URL, { method: "POST", headers: { "content-type": "application/json", "user-agent": USER_AGENT }, body }, "The elevation catalogue (Planetary Computer STAC)")) as { features?: StacItem[] };
  const item = json?.features?.[0];
  const href = item?.assets?.elevation?.href;
  if (!item || !href) throw new TerrainFetchError("The elevation catalogue has no NASADEM tile for this point (NASADEM covers about 60 N to 56 S).");
  return { id: item.id, href };
}

export async function fetchReadToken(f: TerrainFetchLike): Promise<string> {
  const json = (await fetchJson(f, SAS_TOKEN_URL, { headers: { "user-agent": USER_AGENT } }, "The elevation read-token service")) as { token?: string };
  if (!json?.token) throw new TerrainFetchError("The elevation read-token service returned no token.");
  return json.token;
}

export type NasademOptions = { fetchImpl?: TerrainFetchLike; gridSize?: number; now?: () => Date };

/** Read a (gridSize + 2) square window of NASADEM centred on the pixel containing (lat, lon). */
export async function fetchNasademRaw(lat: number, lon: number, opts: NasademOptions = {}): Promise<TerrainRaw> {
  const f = opts.fetchImpl ?? (globalThis.fetch as unknown as TerrainFetchLike);
  const size = opts.gridSize ?? GRID_SIZE;
  const win = size + 2;
  const item = await findNasademItem(lat, lon, f);
  const token = await fetchReadToken(f);
  let tiff;
  try {
    tiff = await fromUrl(`${item.href}?${token}`);
  } catch (e) {
    throw new TerrainFetchError(`The elevation tile could not be opened (${e instanceof Error ? e.message : String(e)}).`);
  }
  const img = await tiff.getImage();
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution();
  const resLon = Math.abs(rx);
  const resLat = Math.abs(ry);
  const col = Math.floor((lon - ox) / rx);
  const row = Math.floor((lat - oy) / ry);
  const half = Math.floor(win / 2);
  const x0 = col - half;
  const y0 = row - half;
  if (x0 < 0 || y0 < 0 || x0 + win > img.getWidth() || y0 + win > img.getHeight()) {
    throw new TerrainFetchError("This point is too close to the edge of a 1 degree elevation tile for the 1.2 km window (edge handling is not implemented).");
  }
  const data = (await img.readRasters({ window: [x0, y0, x0 + win, y0 + win], samples: [0], interleave: false })) as unknown as ArrayLike<number>[];
  const band = data[0];
  const nd = img.getGDALNoData();
  return {
    tileId: item.id,
    stacSearchUrl: STAC_SEARCH_URL,
    assetUrl: item.href,
    fetchedAt: (opts.now ?? (() => new Date()))().toISOString(),
    pinLat: lat,
    pinLon: lon,
    windowRows: win,
    windowCols: win,
    resDegLon: resLon,
    resDegLat: resLat,
    windowWest: ox + x0 * rx,
    windowNorth: oy + y0 * ry,
    elevationM: Array.from(band),
    noData: nd === null || nd === undefined ? null : Number(nd),
  };
}
