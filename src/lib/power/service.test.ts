import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./client";
import { createPowerService } from "./service";
import { jsonResponse, makeRaw } from "./testFixtures";

const START = "2025-01-01";
const END = "2025-01-05";
let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "power-test-"));
});

function svc(fetchImpl: FetchLike, extra: { savedDir?: string; cacheDir?: string; cacheFallbackDir?: string } = {}) {
  return createPowerService({
    client: { fetchImpl, sleep: async () => {}, maxRetries: 1 },
    savedDir: extra.savedDir ?? path.join(tmp, "saved"),
    cacheDir: extra.cacheDir ?? path.join(tmp, "cache"),
    cacheFallbackDir: extra.cacheFallbackDir,
    start: START,
    end: END,
  });
}
const okFetch = () => vi.fn<FetchLike>(async () => jsonResponse(makeRaw({ start: START, end: END })));

describe("getPowerData", () => {
  it("invalid coordinates give an error without calling fetch", async () => {
    const f = okFetch();
    const s = svc(f);
    for (const [lat, lon] of [[91, 0], [0, 181], [NaN, 5], [10, Infinity]]) {
      const r = await s.getPowerData(lat, lon);
      expect(r.status).toBe("error");
      expect(r.days).toEqual([]);
      expect(r.coverage).toBeNull();
      expect(r.message).toMatch(/Invalid/);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("live then memory cache keeps the original fetchedAt", async () => {
    const f = okFetch();
    const s = svc(f);
    const a = await s.getPowerData(41.59, -93.62);
    expect(a.origin).toBe("live");
    expect(a.status).toBe("ok");
    await new Promise((r) => setTimeout(r, 15));
    const b = await s.getPowerData(41.6, -93.6); // same 0.5 cell
    expect(f).toHaveBeenCalledTimes(1);
    expect(b.origin).toBe("cache");
    expect(b.fetchedAt).toBe(a.fetchedAt);
    expect(b.lat).toBe(41.6);
    expect(b.message).toMatch(/shared by every point in the same 0\.5-degree grid square/);
    expect(b.message).toMatch(/41\.59° N, 93\.62° W/);
  });

  it("disk cache survives a new service instance (fresh process)", async () => {
    const f = okFetch();
    const a = await svc(f).getPowerData(41.59, -93.62);
    const f2 = okFetch();
    const b = await svc(f2).getPowerData(41.59, -93.62);
    expect(f2).not.toHaveBeenCalled();
    expect(b.origin).toBe("cache");
    expect(b.fetchedAt).toBe(a.fetchedAt);
    expect(b.days).toEqual(a.days);
  });

  it("falls back to the temp dir when the preferred cache dir is not writable", async () => {
    const blocker = path.join(tmp, "file");
    fs.writeFileSync(blocker, "x"); // a file where a dir is needed -> mkdir fails
    const f = okFetch();
    const a = await svc(f, { cacheDir: path.join(blocker, "sub"), cacheFallbackDir: path.join(tmp, "fallback") }).getPowerData(-12.3, 45.6);
    expect(a.status).toBe("ok");
    expect(f).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(path.join(tmp, "fallback"))).toContain("-12.5_45.5.json");
  });

  it("never caches errors", async () => {
    const f = vi.fn<FetchLike>(async () => jsonResponse("down", 500));
    const s = svc(f);
    const a = await s.getPowerData(5, 5);
    expect(a.status).toBe("error");
    expect(a.message).toMatch(/HTTP 500/);
    const calls = f.mock.calls.length;
    expect(calls).toBe(2); // 1 attempt + 1 retry
    await s.getPowerData(5, 5);
    expect(f.mock.calls.length).toBe(calls * 2);
    expect(fs.existsSync(path.join(tmp, "cache"))).toBe(true);
    expect(fs.readdirSync(path.join(tmp, "cache")).filter((n) => n.endsWith(".json"))).toEqual([]);
  });

  it("fresh skips caches and refreshes the fetch time", async () => {
    const f = okFetch();
    const s = svc(f);
    const a = await s.getPowerData(41.59, -93.62);
    await new Promise((r) => setTimeout(r, 15));
    const b = await s.getPowerData(41.59, -93.62, { fresh: true });
    expect(f).toHaveBeenCalledTimes(2);
    expect(b.origin).toBe("live");
    expect(b.fetchedAt > a.fetchedAt).toBe(true);
    expect((await s.getPowerData(41.59, -93.62)).fetchedAt).toBe(b.fetchedAt);
  });

  it("timeout yields an error result", async () => {
    const hang: FetchLike = (_u, init) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    const s = createPowerService({ client: { fetchImpl: hang, timeoutMs: 20 }, savedDir: path.join(tmp, "s"), cacheDir: path.join(tmp, "c"), start: START, end: END });
    const r = await s.getPowerData(1, 1);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/timed out after 20 ms/);
  });
});

describe("saved demo pins", () => {
  function writeSaved(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    const saved = {
      pinId: "brentwood",
      lat: 37.93,
      lon: -121.66,
      fetchedAt: "2026-11-15T06:31:16.882Z",
      sourceUrls: ["https://example.invalid/saved"],
      responses: [makeRaw({ start: START, end: END, elevation: 105.1 })],
    };
    fs.writeFileSync(path.join(dir, "brentwood.json"), JSON.stringify(saved));
    return saved;
  }

  it("loadSavedDemoPin normalizes the saved file with origin saved and its real fetchedAt", async () => {
    const dir = path.join(tmp, "saved");
    const saved = writeSaved(dir);
    const f = okFetch();
    const r = await svc(f).loadSavedDemoPin("brentwood");
    expect(r.origin).toBe("saved");
    expect(r.fetchedAt).toBe(saved.fetchedAt);
    expect(r.status).toBe("ok");
    expect(r.days).toHaveLength(5);
    expect(r.elevationM).toBe(105.1);
    expect(f).not.toHaveBeenCalled();
  });

  it("a request in a demo pin's cell is served from the saved file without network", async () => {
    writeSaved(path.join(tmp, "saved"));
    const f = okFetch();
    const r = await svc(f).getPowerData(37.93, -121.66);
    expect(r.origin).toBe("saved");
    expect(r.fetchedAt).toBe("2026-11-15T06:31:16.882Z");
    expect(f).not.toHaveBeenCalled();
    const near = await svc(f).getPowerData(37.8, -121.7);
    expect(near.origin).toBe("saved");
    expect(near.message).toMatch(/shared by every point/);
    // fresh skips saved data and goes live
    const live = await svc(f).getPowerData(37.93, -121.66, { fresh: true });
    expect(live.origin).toBe("live");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("missing saved file or unknown pin is an explicit error", async () => {
    const s = svc(okFetch());
    const a = await s.loadSavedDemoPin("fresno");
    expect(a.status).toBe("error");
    expect(a.message).toMatch(/missing or unreadable/);
    expect((await s.loadSavedDemoPin("nowhere")).message).toMatch(/Unknown demo pin/);
  });
});

describe("committed saved files (real data)", () => {
  const dir = path.join(process.cwd(), "data", "power");
  for (const id of ["brentwood", "fresno", "ludhiana"]) {
    it(`${id}: loads through the same normalizer`, async () => {
      const file = path.join(dir, `${id}.json`);
      expect(fs.existsSync(file)).toBe(true);
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { fetchedAt: string };
      const f = okFetch();
      const r = await createPowerService({ client: { fetchImpl: f } }).loadSavedDemoPin(id);
      expect(r.origin).toBe("saved");
      expect(r.fetchedAt).toBe(raw.fetchedAt);
      expect(r.status).not.toBe("error");
      expect(r.days).toHaveLength(14975);
      expect(r.days[0].date).toBe("1985-01-01");
      expect(r.days.at(-1)!.date).toBe("2025-12-31");
      expect(f).not.toHaveBeenCalled();
    });
  }
});
