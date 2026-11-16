import { describe, expect, it, vi } from "vitest";
import { fetchCdlLayer, fetchDaymetLayer, fetchNlcdLayer, fetchWellsLayer } from "./fetchers";
import { getText, mapLimit, type FetchLike } from "./http";

const resp = (status: number, body: string) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const fast = { sleep: async () => {}, maxRetries: 1 };

describe("http helpers", () => {
  it("retries a 500 then succeeds; does not retry a 400", async () => {
    let n = 0;
    const f = vi.fn<FetchLike>(async () => (n++ === 0 ? { ok: false, status: 500, text: async () => "boom" } : { ok: true, status: 200, text: async () => "fine" }));
    expect(await getText("http://x", { fetchImpl: f, ...fast })).toBe("fine");
    expect(f).toHaveBeenCalledTimes(2);
    const g = vi.fn<FetchLike>(resp(400, "bad"));
    await expect(getText("http://x", { fetchImpl: g, ...fast })).rejects.toMatchObject({ status: 400, body: "bad" });
    expect(g).toHaveBeenCalledTimes(1);
  });
  it("mapLimit keeps order and respects the limit", async () => {
    let live = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (x) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return x * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("coverage handling uses the service's real answer", () => {
  it("Daymet 'tile not found' is no-coverage", async () => {
    const f = vi.fn<FetchLike>(resp(400, '{"message":"Daymet Tile was not found with input lat and lon"}'));
    const r = await fetchDaymetLayer(30.9, 75.85, null, null, { fetchImpl: f, ...fast });
    expect(r.layer.status).toBe("no-coverage");
    expect(r.layer.data).toBeNull();
  });
  it("Daymet 503 is an error, not no-coverage", async () => {
    const r = await fetchDaymetLayer(37.9, -121.6, null, null, { fetchImpl: vi.fn<FetchLike>(resp(503, "down")), ...fast });
    expect(r.layer.status).toBe("error");
  });
  it("CDL 'Failed to get value' is no-coverage; other failures inside the US are errors", async () => {
    const a = await fetchCdlLayer(30.9, 75.85, { fetchImpl: vi.fn<FetchLike>(resp(500, "<faultstring>Error: Failed to get value.</faultstring>")), ...fast });
    expect(a.status).toBe("no-coverage");
    const b = await fetchCdlLayer(37.93, -121.66, { fetchImpl: vi.fn<FetchLike>(resp(503, "down")), ...fast });
    expect(b.status).toBe("error");
  });
  it("NLCD empty feature list is no-coverage", async () => {
    const r = await fetchNlcdLayer(30.9, 75.85, { fetchImpl: vi.fn<FetchLike>(resp(200, '{"features":[]}')), ...fast });
    expect(r.status).toBe("no-coverage");
  });
  it("wells: no sites is no-coverage", async () => {
    const r = await fetchWellsLayer(30.9, 75.85, { fetchImpl: vi.fn<FetchLike>(resp(200, '{"features":[]}')), ...fast });
    expect(r.status).toBe("no-coverage");
  });
});
