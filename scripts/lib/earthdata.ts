import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { SMAP_COLLECTION, IMERG_COLLECTION } from "../../src/lib/earthdata/sources";
import { monthlyRainMm, smapQuality } from "../../src/lib/earthdata/normalize";
import type { SmapObservation, ImergObservation, SavedLayer } from "../../src/lib/earthdata/types";

const HARMONY = "https://harmony.earthdata.nasa.gov";
const NASA_AUTH = new Set([HARMONY, "https://opendap.earthdata.nasa.gov"]);
const PUBLIC = new Set(["https://cmr.earthdata.nasa.gov"]);
const CDN = "dqzb5lcolc8fj.cloudfront.net";
const MAX_BYTES = 12 * 1024 * 1024;
type Pin = { id: string; lat: number; lon: number };
type Job = { status: string; message?: string; jobID?: string; numInputGranules?: number; links?: { rel: string; href: string; title?: string }[] };
const smapJobs = new Map<string, Promise<Job>>();
const rasterBuffers = new Map<string, Promise<ArrayBuffer>>();

/** No credential is forwarded to a CDN or an arbitrary URL returned by NASA. */
export async function earthdataRequest(input: string, token: string): Promise<Response> {
  let u = new URL(input);
  if (!NASA_AUTH.has(u.origin) && !PUBLIC.has(u.origin)) throw new Error("Refused an unexpected initial Earthdata origin.");
  for (let redirects = 0; redirects < 6; redirects++) {
    const headers: Record<string, string> = NASA_AUTH.has(u.origin) ? { Authorization: `Bearer ${token}` } : {};
    const r = await fetch(u, { headers, redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if (![301, 302, 303, 307, 308].includes(r.status)) return r;
    const loc = r.headers.get("location");
    await r.body?.cancel();
    if (!loc) throw new Error("NASA returned a redirect without a destination.");
    u = new URL(loc, u);
    if (u.protocol !== "https:" || !(NASA_AUTH.has(u.origin) || PUBLIC.has(u.origin) || u.hostname === CDN || u.hostname.endsWith(".amazonaws.com"))) throw new Error("Refused an unexpected Earthdata download redirect; credential was not forwarded.");
  }
  throw new Error("NASA returned too many redirects.");
}

async function limited(r: Response): Promise<Uint8Array> {
  if (!r.ok) { await r.body?.cancel(); throw new Error(`NASA ${new URL(r.url).hostname} returned HTTP ${r.status}. For IMERG HTTP 403, check NASA GES DISC terms in Earthdata Login; no values were substituted.`); }
  if (Number(r.headers.get("content-length")) > MAX_BYTES) { await r.body?.cancel(); throw new Error("NASA subset exceeded the 12 MiB download cap."); }
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = r.body!.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    size += chunk.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error("NASA subset exceeded the 12 MiB download cap."); }
    chunks.push(chunk);
  }
  const result = new Uint8Array(size); let pos = 0;
  for (const chunk of chunks) { result.set(chunk, pos); pos += chunk.byteLength; }
  return result;
}
async function text(url: string, token: string) { return new TextDecoder().decode(await limited(await earthdataRequest(url, token))); }
async function json<T>(url: string, token: string): Promise<T> { return JSON.parse(await text(url, token)) as T; }

async function smapJob(start: string, end: string, days: number, token: string): Promise<Job> {
  const url = new URL(`${HARMONY}/ogc-api-edr/1.1.0/collections/${SMAP_COLLECTION}/cube`);
  // A real probe found fill-only spatial subsets despite valid source pixels.
  // Keep the native grid and subset only time/variables; reuse these small compressed
  // rasters across all pins in memory, never write global raster files to disk.
  for (const [k, v] of Object.entries({ datetime: `${start}T00:00:00Z/${end}T23:59:59Z`, "parameter-name": "Soil_Moisture_Retrieval_Data_AM/soil_moisture,Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag", f: "image/tiff", forceAsync: "true", skipPreview: "true", ignoreErrors: "false", maxResults: String(days) })) url.searchParams.set(k, v);
  let job = await json<Job>(url.href, token);
  if (!job.jobID || !/^[a-f0-9-]{36}$/.test(job.jobID)) throw new Error("NASA Harmony did not return a recognized job ID.");
  const jobUrl = `${HARMONY}/jobs/${job.jobID}`;
  const deadline = Date.now() + 6 * 60_000;
  while (["running", "accepted", "queued", "previewing"].includes(job.status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    job = await json<Job>(jobUrl, token);
  }
  if (job.status !== "successful") throw new Error(`NASA Harmony SMAP job ${job.status}: ${job.message?.replaceAll(token, "[redacted]") ?? "No provider explanation."}`);
  return job;
}

async function pixel(url: string, pin: Pin, token: string) {
  if (new URL(url).origin !== HARMONY) throw new Error("Refused non-Harmony initial download URL.");
  let buffer = rasterBuffers.get(url);
  if (!buffer) { buffer = earthdataRequest(url, token).then(limited).then(bytes => bytes.buffer as ArrayBuffer); rasterBuffers.set(url, buffer); }
  const image = await (await fromArrayBuffer(await buffer)).getImage();
  // Keep the native grid, so no interpolation can alter categorical quality bits.
  // SPL3SMP_E v006 User Guide Table 4 defines the global EASE-Grid 2.0 (EPSG:6933).
  const keys = image.getGeoKeys();
  if (!keys || !(keys.ProjectedCSTypeGeoKey === 6933 || (keys.ProjCoordTransGeoKey === 28 && keys.ProjStdParallel1GeoKey === 30 && keys.ProjNatOriginLongGeoKey === 0))) throw new Error("SMAP subset is not on the expected native EASE-Grid 2.0 global projection.");
  const ease = "+proj=cea +lon_0=0 +lat_ts=30 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs";
  const [pinX, pinY] = proj4("EPSG:4326", ease, [pin.lon, pin.lat]);
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const w = image.getWidth(), h = image.getHeight();
  const x = Math.floor((pinX - minX) / (maxX - minX) * w), y = Math.floor((maxY - pinY) / (maxY - minY) * h);
  if (x < 0 || y < 0 || x >= w || y >= h) throw new Error("SMAP subset does not contain the requested pin.");
  const rasters = await image.readRasters({ window: [x, y, x + 1, y + 1], samples: [0] });
  const value = Number(rasters[0][0]);
  const [pixelLon, pixelLat] = proj4(ease, "EPSG:4326", [minX + (x + 0.5) * (maxX - minX) / w, maxY - (y + 0.5) * (maxY - minY) / h]);
  return { value: Number.isFinite(value) && value !== image.getGDALNoData() ? value : null, pixelLon, pixelLat };
}

export async function fetchSmap(pin: Pin, start: string, end: string, days: number, token: string): Promise<SavedLayer<SmapObservation>> {
  const period = `${start}/${end}`;
  let pending = smapJobs.get(period);
  if (!pending) { pending = smapJob(start, end, days, token); smapJobs.set(period, pending); }
  const job = await pending;
  const byDate = new Map<string, { sourceGranule: string; moisture?: Awaited<ReturnType<typeof pixel>>; flag?: Awaited<ReturnType<typeof pixel>> }>();
  for (const link of job.links?.filter(l => l.rel === "data") ?? []) {
    const match = link.title?.match(/^(SMAP_L3_SM_P_E_(\d{4})(\d{2})(\d{2})_R\d+_\d+).*Soil_Moisture_Retrieval_Data_AM_(soil_moisture|retrieval_qual_flag)_/);
    if (!match) throw new Error("Unrecognized SMAP subset file name; refusing to guess date or variable.");
    const date = `${match[2]}-${match[3]}-${match[4]}`;
    if (date < start || date > end) throw new Error("SMAP service returned a date outside the requested period.");
    const entry = byDate.get(date) ?? { sourceGranule: match[1] + ".h5" };
    const key = match[5] === "soil_moisture" ? "moisture" : "flag";
    if (entry[key]) throw new Error("SMAP returned duplicate variables for a date.");
    entry[key] = await pixel(link.href, pin, token); byDate.set(date, entry);
  }
  const observations: SmapObservation[] = [];
  for (const [date, p] of byDate) {
    if (!p.moisture || !p.flag || Math.abs(p.moisture.pixelLat - p.flag.pixelLat) > 1e-6 || Math.abs(p.moisture.pixelLon - p.flag.pixelLon) > 1e-6) throw new Error("SMAP moisture and quality grids are missing or misaligned.");
    observations.push({ date, ...smapQuality(p.moisture.value, p.flag.value), pixelLat: p.moisture.pixelLat, pixelLon: p.moisture.pixelLon, sourceGranule: p.sourceGranule });
  }
  observations.sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length === 0) throw new Error("SMAP returned no observation files for this point and period.");
  return { status: observations.some(o => o.valueM3M3 !== null) ? "ok" : "no-data", requestedStart: start, requestedEnd: end, observations };
}

export async function fetchImerg(pin: Pin, month: string, token: string): Promise<SavedLayer<ImergObservation>> {
  const [year, m] = month.split("-").map(Number);
  const start = `${month}-01`, end = `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`;
  const cmr = new URL("https://cmr.earthdata.nasa.gov/search/granules.json");
  cmr.searchParams.set("collection_concept_id", IMERG_COLLECTION); cmr.searchParams.set("temporal", `${start}T00:00:00Z,${end}T23:59:59Z`); cmr.searchParams.set("page_size", "3");
  const found = await json<{ feed: { entry: { title: string }[] } }>(cmr.href, token);
  if (found.feed.entry.length !== 1) throw new Error(`IMERG returned ${found.feed.entry.length} granules for ${month}; expected one monthly record.`);
  const granule = found.feed.entry[0].title;
  const base = `https://opendap.earthdata.nasa.gov/collections/${IMERG_COLLECTION}/granules/${encodeURIComponent(granule)}`;
  const attributes = await text(base + ".das", token);
  for (const variable of ["precipitation", "randomError"]) {
    const block = attributes.match(new RegExp(`(?:/Grid/)?${variable}\\s*\\{([^}]+)\\}`))?.[1];
    if (!block || !/units\s+"mm\/hr"/.test(block)) throw new Error(`IMERG ${variable} units changed or were absent; expected mm/hr.`);
  }
  const dimensions = await text(base + ".dds", token);
  if (!/Float32 precipitation\[time = 1\]\[lon = 3600\]\[lat = 1800\]/.test(dimensions)) throw new Error("IMERG variable dimensions changed; expected time, longitude, latitude.");
  const lonIndex = Math.floor((pin.lon + 180) * 10), latIndex = Math.floor((pin.lat + 90) * 10);
  const fields = ["precipitation", "precipitationQualityIndex", "randomError"];
  const raw = await text(base + ".ascii?" + encodeURI(fields.map(f => `/Grid/${f}[0][${lonIndex}][${latIndex}]`).join(",")), token);
  const read = (field: string) => {
    const match = raw.match(new RegExp(`/Grid/${field}\\.${field}\\[[^\\n]+\\],\\s*([^\\s,]+)`));
    if (!match) throw new Error(`IMERG scalar response has no ${field}; refusing to guess its shape.`);
    const v = Number(match[1]); return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const lat = Number(raw.match(/\/Grid\/precipitation\.lat,\s*([^\s,]+)/)?.[1]);
  const lon = Number(raw.match(/\/Grid\/precipitation\.lon=([^\]]+)/)?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat - pin.lat) > 0.051 || Math.abs(lon - pin.lon) > 0.051) throw new Error("IMERG scalar coordinates do not match the requested cell.");
  const rate = read("precipitation");
  return { status: rate === null ? "no-data" : "ok", requestedStart: start, requestedEnd: end, observations: [{ month, rateMmPerHour: rate, totalMm: monthlyRainMm(month, rate), randomErrorMmPerHour: read("randomError"), qualityIndex: read("precipitationQualityIndex"), pixelLat: lat, pixelLon: lon, sourceGranule: granule }] };
}
