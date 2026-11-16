import fs from "node:fs/promises";
import path from "node:path";
import type { ModisSavedFile } from "./modis";

/** Saved MODIS 250 m NDVI record (Brentwood only). null when the file does not exist. Never fetches. */
export async function loadSavedNdviModis(pinId: string, dataDir = path.join(process.cwd(), "data", "ndvi")): Promise<ModisSavedFile | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, `${pinId}-modis.json`), "utf8")) as ModisSavedFile;
  } catch {
    return null;
  }
}
export type { ModisSavedFile };
