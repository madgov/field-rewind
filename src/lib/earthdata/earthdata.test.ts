import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { smapQuality, monthlyRainMm } from "./normalize";
import { loadSavedEarthdata } from "./saved";
import { DEMO_PINS } from "../demoPins";
import { earthdataRequest } from "../../../scripts/lib/earthdata";

describe("Earthdata credential boundaries", () => {
  it("refuses a non-NASA initial URL before sending any request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      await expect(earthdataRequest("https://example.com/data", "TEST_TOKEN_NOT_REAL")).rejects.toThrow("unexpected initial");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("sends the bearer to Harmony, but never forwards it to the allowed delivery CDN", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "https://dqzb5lcolc8fj.cloudfront.net/signed-example" } }))
      .mockResolvedValueOnce(new Response("data", { status: 200 }));
    try {
      expect((await earthdataRequest("https://harmony.earthdata.nasa.gov/download/example", "TEST_TOKEN_NOT_REAL")).status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer TEST_TOKEN_NOT_REAL" });
      expect(fetch.mock.calls[1][1]?.headers).toEqual({});
      expect(fetch.mock.calls.every(c => c[1]?.redirect === "manual")).toBe(true);
    } finally { fetch.mockRestore(); }
  });
  it("refuses off-allowlist redirects without contacting the destination", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "https://example.com/collect" } }));
    try {
      await expect(earthdataRequest("https://harmony.earthdata.nasa.gov/download/example", "TEST_TOKEN_NOT_REAL")).rejects.toThrow("unexpected Earthdata download redirect");
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { fetch.mockRestore(); }
  });
});

describe("SMAP v006 quality masking", () => {
  it("accepts only moisture flags 0 and 8, never interpolates or replaces missing observations", () => {
    for (let flag = 0; flag <= 15; flag++) expect(smapQuality(0.25, flag).valueM3M3).toBe(flag === 0 || flag === 8 ? 0.25 : null);
    for (const value of [null, -9999, NaN, Infinity, -0.1, 1.1]) expect(smapQuality(value, 0).valueM3M3).toBeNull();
    for (const flag of [null, 65535, 0.5, NaN]) expect(smapQuality(0.25, flag).valueM3M3).toBeNull();
    expect(smapQuality(0, 0).valueM3M3).toBe(0);
  });
});
describe("IMERG monthly units", () => {
  it("converts a monthly mean rate to the actual calendar-month amount, preserving missing and zero", () => {
    expect(monthlyRainMm("2024-02", 1)).toBe(29 * 24);
    expect(monthlyRainMm("2025-02", 1)).toBe(28 * 24);
    expect(monthlyRainMm("2025-07", 0)).toBe(0);
    expect(monthlyRainMm("2025-07", null)).toBeNull();
    expect(() => monthlyRainMm("2025-99", 1)).toThrow();
  });
});
describe("real saved Earthdata snapshots", () => {
  it("reads all three demo places without any network call or token", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this saved-file test"));
    try {
      for (const pin of DEMO_PINS) {
        const r = await loadSavedEarthdata(pin.lat, pin.lon);
        expect(r.status, pin.id).toBe("saved");
        if (r.status !== "saved") throw new Error(r.message);
        expect(r.originLine).toContain("Saved response from");
        expect(r.data.smap.observations.length).toBeGreaterThan(0);
        expect(r.data.imerg.observations).toHaveLength(1);
        expect(r.data.imerg.observations[0].sourceGranule).toContain("GPM_3IMERGM.07");
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("reports unsupported places explicitly without filling the gap", async () => {
    const r = await loadSavedEarthdata(0, 0);
    expect(r.status).toBe("unavailable");
    if (r.status === "unavailable") expect(r.message).toContain("No Earthdata request");
  });
  it("refuses malformed saved values rather than displaying unverified observations", async () => {
    const parent = path.join(process.cwd(), "scratchpad", "earthdata-tests"); await mkdir(parent, { recursive: true });
    const dir = await mkdtemp(path.join(parent, "bad-"));
    try {
      const good = JSON.parse(await readFile(path.join(process.cwd(), "data", "earthdata", "brentwood.json"), "utf8"));
      good.smap.observations[0].valueM3M3 = 100;
      await writeFile(path.join(dir, "brentwood.json"), JSON.stringify(good));
      expect((await loadSavedEarthdata(37.93, -121.66, dir)).status).toBe("unavailable");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
