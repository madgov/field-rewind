import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../power/client";
import { OFFLINE_MESSAGE } from "../power/offline";
import { buildPowerExtraUrl } from "./client";
import { createPowerExtraService } from "./service";
import { jsonResponse, makeExtraRaw } from "./testFixtures";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "power-extra-test-"));
const throwingFetch = () =>
  vi.fn<FetchLike>(async () => {
    throw new Error("fetch must not be called");
  });

describe("offline switch", () => {
  it("serves a saved demo pin with no network call", async () => {
    const f = throwingFetch();
    const svc = createPowerExtraService({ client: { fetchImpl: f }, offline: true, cacheDir: path.join(tmp(), "c") });
    const r = await svc.getPowerExtra(37.93, -121.66);
    expect(r.origin).toBe("saved");
    expect(["ok", "partial"]).toContain(r.status);
    expect(r.days).toHaveLength(14975);
    expect(f).not.toHaveBeenCalled();
  });

  it("loadSavedPowerExtra never calls fetch, even with the offline switch off", async () => {
    const f = throwingFetch();
    const svc = createPowerExtraService({ client: { fetchImpl: f }, offline: false, cacheDir: path.join(tmp(), "c") });
    for (const id of ["brentwood", "fresno", "ludhiana"]) expect((await svc.loadSavedPowerExtra(id)).origin).toBe("saved");
    expect((await svc.loadSavedPowerExtra("nowhere")).status).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });

  it("returns a structured plain-English error for an unsaved coordinate, never calling fetch", async () => {
    const f = throwingFetch();
    const svc = createPowerExtraService({ client: { fetchImpl: f }, offline: true, cacheDir: path.join(tmp(), "c") });
    const r = await svc.getPowerExtra(10.5, 20.5);
    expect(r.status).toBe("error");
    expect(r.message).toBe(OFFLINE_MESSAGE);
    expect(r.days).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("offline ignores fresh and the runtime cache for unsaved places", async () => {
    const f = throwingFetch();
    const svc = createPowerExtraService({ client: { fetchImpl: f }, offline: () => true, cacheDir: path.join(tmp(), "c") });
    expect((await svc.getPowerExtra(10.5, 20.5, { fresh: true })).status).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });

  it("invalid coordinates are an error before any network use", async () => {
    const f = throwingFetch();
    const svc = createPowerExtraService({ client: { fetchImpl: f }, offline: false, cacheDir: path.join(tmp(), "c") });
    expect((await svc.getPowerExtra(200, 0)).status).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("live fetch and cache", () => {
  const start = "2020-01-01";
  const end = "2020-03-31";
  const body = () => makeExtraRaw({ start, end });

  it("fetches once, labels it live, then serves the same cell as a cache hit with the original fetch time", async () => {
    const f = vi.fn<FetchLike>(async () => jsonResponse(body()));
    const svc = createPowerExtraService({ client: { fetchImpl: f, sleep: async () => {} }, offline: false, cacheDir: path.join(tmp(), "c"), cacheFallbackDir: path.join(tmp(), "f"), start, end });
    const a = await svc.getPowerExtra(10.1, 20.1);
    expect(a.origin).toBe("live");
    expect(a.status).toBe("ok");
    expect(a.sourceUrls[0]).toBe(buildPowerExtraUrl(10.1, 20.1, start, end));
    const b = await svc.getPowerExtra(10.2, 20.2);
    expect(b.origin).toBe("cache");
    expect(b.fetchedAt).toBe(a.fetchedAt);
    expect(b.message).toMatch(/shared by every point/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 once then succeeds, and does not retry a 422", async () => {
    let n = 0;
    const f = vi.fn<FetchLike>(async () => (n++ === 0 ? new Response("busy", { status: 503 }) : jsonResponse(body())));
    const svc = createPowerExtraService({ client: { fetchImpl: f, sleep: async () => {} }, offline: false, cacheDir: path.join(tmp(), "c"), cacheFallbackDir: path.join(tmp(), "f"), start, end });
    expect((await svc.getPowerExtra(11.1, 21.1)).status).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);

    const g = vi.fn<FetchLike>(async () => new Response('{"detail":"bad"}', { status: 422 }));
    const svc2 = createPowerExtraService({ client: { fetchImpl: g, sleep: async () => {} }, offline: false, cacheDir: path.join(tmp(), "c2"), cacheFallbackDir: path.join(tmp(), "f2"), start, end });
    const r = await svc2.getPowerExtra(12.1, 22.1);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/HTTP 422/);
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("does not cache errors", async () => {
    let fail = true;
    const f = vi.fn<FetchLike>(async () => (fail ? new Response("x", { status: 422 }) : jsonResponse(body())));
    const svc = createPowerExtraService({ client: { fetchImpl: f, sleep: async () => {} }, offline: false, cacheDir: path.join(tmp(), "c"), cacheFallbackDir: path.join(tmp(), "f"), start, end });
    expect((await svc.getPowerExtra(13.1, 23.1)).status).toBe("error");
    fail = false;
    expect((await svc.getPowerExtra(13.1, 23.1)).origin).toBe("live");
  });

  it("builds a URL with the eight parameters", () => {
    const u = buildPowerExtraUrl(37.93, -121.66, "1985-01-01", "2025-12-31");
    expect(u).toContain("parameters=GWETROOT,GWETTOP,GWETPROF,T2MDEW,TS,EVLAND,PS,FROST_DAYS");
    expect(u).toContain("community=AG");
    expect(u).toContain("start=19850101");
    expect(u).toContain("end=20251231");
  });
});
