import { describe, expect, it, vi } from "vitest";
import { buildPowerUrl, fetchPowerRaw, fetchPowerUrl, PowerFetchError, type FetchLike } from "./client";
import { jsonResponse, makeRaw } from "./testFixtures";

const noSleep = async () => {};

describe("buildPowerUrl", () => {
  it("builds the documented endpoint", () => {
    const u = buildPowerUrl(37.93, -121.66, "1985-01-01", "2025-12-31");
    expect(u).toBe(
      "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR&community=AG&longitude=-121.66&latitude=37.93&start=19850101&end=20251231&format=JSON",
    );
  });
});

describe("fetchPowerUrl", () => {
  it("retries 5xx up to the bound and then reports the status", async () => {
    const f = vi.fn<FetchLike>(async () => jsonResponse("boom", 503));
    await expect(fetchPowerUrl("u", { fetchImpl: f, maxRetries: 2, sleep: noSleep })).rejects.toMatchObject({ kind: "http", status: 503 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("retries network errors, then succeeds", async () => {
    let n = 0;
    const f = vi.fn<FetchLike>(async () => {
      if (++n < 3) throw new TypeError("fetch failed");
      return jsonResponse({ ok: true });
    });
    const sleeps: number[] = [];
    const r = await fetchPowerUrl("u", { fetchImpl: f, maxRetries: 2, backoffBaseMs: 100, sleep: async (ms) => void sleeps.push(ms) });
    expect(r).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("retries 429", async () => {
    const f = vi.fn<FetchLike>().mockResolvedValueOnce(jsonResponse("slow down", 429)).mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    await expect(fetchPowerUrl("u", { fetchImpl: f, sleep: noSleep })).resolves.toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not retry 4xx validation errors", async () => {
    const f = vi.fn<FetchLike>(async () => jsonResponse({ detail: "bad longitude" }, 422));
    const err = await fetchPowerUrl("u", { fetchImpl: f, sleep: noSleep }).catch((e) => e);
    expect(err).toBeInstanceOf(PowerFetchError);
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/HTTP 422.*bad longitude/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("times out with a clear message and does not retry", async () => {
    const f = vi.fn<FetchLike>(
      (_u, init) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))),
    );
    const err = await fetchPowerUrl("u", { fetchImpl: f, timeoutMs: 20, sleep: noSleep }).catch((e) => e);
    expect(err.kind).toBe("timeout");
    expect(err.message).toMatch(/timed out after 20 ms/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports invalid JSON", async () => {
    const f = vi.fn<FetchLike>(async () => jsonResponse("<html>nope</html>"));
    await expect(fetchPowerUrl("u", { fetchImpl: f, sleep: noSleep })).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("fetchPowerRaw", () => {
  it("requests one URL per chunk, in order", async () => {
    const urls: string[] = [];
    const f: FetchLike = async (u) => {
      urls.push(u);
      return jsonResponse(makeRaw({ start: "2020-01-01", end: "2020-01-02" }));
    };
    const r = await fetchPowerRaw(10, 20, "2020-01-01", "2022-12-31", { fetchImpl: f, chunkYears: 2 });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/start=20200101&end=20211231/);
    expect(urls[1]).toMatch(/start=20220101&end=20221231/);
    expect(r.sourceUrls).toEqual(urls);
    expect(r.responses).toHaveLength(2);
    expect(new Date(r.fetchedAt).toString()).not.toBe("Invalid Date");
  });
});
