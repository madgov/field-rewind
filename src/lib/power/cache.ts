import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PowerSavedFile } from "./rawTypes";

/**
 * Runtime cache of raw POWER responses keyed by 0.5-degree grid cell key.
 * Disk copies live in `.cache/power/` (or the OS temp dir when the project dir is read-only, as on Vercel).
 * Disk entries use the same wrapper format as the committed saved files.
 */
export class DiskCache {
  private dirPromise: Promise<string> | null = null;
  constructor(private preferredDir: string, private fallbackDir = path.join(os.tmpdir(), "field-rewind-power-cache")) {}

  private resolveDir(): Promise<string> {
    this.dirPromise ??= (async () => {
      for (const dir of [this.preferredDir, this.fallbackDir]) {
        try {
          await fs.mkdir(dir, { recursive: true });
          const probe = path.join(dir, `.write-test-${process.pid}`);
          await fs.writeFile(probe, "ok");
          await fs.rm(probe, { force: true });
          return dir;
        } catch {
          // try the next location
        }
      }
      return ""; // no writable location: disk cache disabled, memory cache only
    })();
    return this.dirPromise;
  }

  private file(dir: string, key: string): string {
    return path.join(dir, `${key}.json`);
  }

  async read(key: string): Promise<PowerSavedFile | null> {
    const dir = await this.resolveDir();
    if (!dir) return null;
    try {
      return JSON.parse(await fs.readFile(this.file(dir, key), "utf8")) as PowerSavedFile;
    } catch {
      return null; // missing or corrupt: treat as a miss
    }
  }

  async write(key: string, data: PowerSavedFile): Promise<void> {
    const dir = await this.resolveDir();
    if (!dir) return;
    try {
      const tmp = this.file(dir, `${key}.${process.pid}.${Date.now()}.tmp`);
      await fs.writeFile(tmp, JSON.stringify(data));
      await fs.rename(tmp, this.file(dir, key));
    } catch {
      // disk cache is best effort; memory cache still holds the entry
    }
  }
}
