import { fromUrl } from "geotiff";
import { COG_TIMEOUT_MS } from "./constants";
import { NdviHttpError } from "./http";

/** A window read from one band of a cloud-optimized GeoTIFF, with the georeferencing needed to place it. */
export type WindowRead = {
  /** Window position and size in pixels (clipped to the image). */
  x0: number;
  y0: number;
  width: number;
  height: number;
  data: ArrayLike<number>;
  /** Georeferencing of the full image: top-left corner and pixel size in the file's CRS (metres for UTM). */
  originX: number;
  originY: number;
  resX: number;
  resY: number;
  imageWidth: number;
  imageHeight: number;
  /** EPSG code from the file's GeoKeys, when present. */
  epsg: number | null;
};

/**
 * Reads a (2r+1) square window centred on the pixel containing projected point (x, y) from the file at `url`.
 * `toPixel` is not needed: the window is computed from the file's own origin and resolution so no STAC projection
 * fields are trusted. Pixels outside the image are clipped (the caller sees a smaller window).
 */
export type RasterReader = (url: string, x: number, y: number, radius: number, signal: AbortSignal) => Promise<WindowRead>;

export const geotiffReader: RasterReader = async (url, x, y, radius, signal) => {
  const tiff = await fromUrl(url, { allowFullFile: false }, signal);
  const image = await tiff.getImage();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  const imageWidth = image.getWidth();
  const imageHeight = image.getHeight();
  const col = Math.floor((x - originX) / resX);
  const row = Math.floor((y - originY) / resY);
  const x0 = Math.max(0, col - radius);
  const y0 = Math.max(0, row - radius);
  const x1 = Math.min(imageWidth, col + radius + 1);
  const y1 = Math.min(imageHeight, row + radius + 1);
  if (x1 <= x0 || y1 <= y0) throw new NdviHttpError("parse", "The point is outside this scene's pixel grid.");
  const keys = image.getGeoKeys?.() as { ProjectedCSTypeGeoKey?: number } | null | undefined;
  const raster = await image.readRasters({ window: [x0, y0, x1, y1], samples: [0], signal });
  const band = (Array.isArray(raster) ? raster[0] : raster) as ArrayLike<number>;
  return { x0, y0, width: x1 - x0, height: y1 - y0, data: band, originX, originY, resX, resY, imageWidth, imageHeight, epsg: keys?.ProjectedCSTypeGeoKey ?? null };
};

/** Race the reader against an explicit timeout (also aborts the underlying range requests). */
export async function readWithTimeout(reader: RasterReader, url: string, x: number, y: number, radius: number, timeoutMs = COG_TIMEOUT_MS): Promise<WindowRead> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await reader(url, x, y, radius, ctl.signal);
  } catch (e) {
    if (ctl.signal.aborted) throw new NdviHttpError("timeout", `Reading a Landsat image took longer than ${Math.round(timeoutMs / 1000)} s.`);
    if (e instanceof NdviHttpError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    // geotiff reports blob-store errors (403/404/5xx) in the message text
    const m = /\b(40[0-9]|5\d\d)\b/.exec(msg);
    throw new NdviHttpError(m ? "http" : "network", `Landsat image read failed: ${msg}`, m ? Number(m[1]) : undefined);
  } finally {
    clearTimeout(timer);
  }
}
