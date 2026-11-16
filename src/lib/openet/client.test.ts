import { describe, expect, it, vi } from "vitest";
import { buildOpenEtBody, fetchOpenEtMonthly, splitDateRange, type FetchLike } from "./client";
import { NO_KEY_MESSAGE, OPENET_POINT_URL } from "./constants";

const KEY = "SECRET-KEY-123";
const NOW = () => new Date("2024-04-10T00:00:00Z");
const rows = (months: string[], et: number | null = 10) => months.map((m) => ({ time: `${m}-01`, et }));
const resp = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const opts = (f: FetchLike, extra = {}) => ({ apiKey: KEY, fetchImpl: f, now: NOW, sleep: async () => {}, start: "2023-01-01", end: "2023-03-31", ...extra });
const Q = [37.93, -121.66] as const;

describe("openet client", () => {
  it("puts [lon, lat] in the body", async () => {
    expect(buildOpenEtBody(37.93, -121.66, "2023-01-01", "2023-03-31").geometry).toEqual([-121.66, 37.93]);
    const f = vi.fn(async () => resp(200, rows(["2023-01", "2023-02", "2023-03"])));
    const r = await fetchOpenEtMonthly(...Q, opts(f));
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body).geometry).toEqual([-121.66, 37.93]);
    expect(r.result.status).toBe("ok");
    expect(r.result.series).toHaveLength(3);
  });

  it("sends the key only in the Authorization header and never returns it", async () => {
    const f = vi.fn(async () => resp(200, rows(["2023-01", "2023-02", "2023-03"])));
    const r = await fetchOpenEtMonthly(...Q, opts(f));
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(OPENET_POINT_URL);
    expect(url).not.toContain(KEY);
    expect(init.body).not.toContain(KEY);
    expect(init.headers.Authorization).toBe(KEY);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("scrubs a key echoed by the server from error messages", async () => {
    const f = vi.fn(async () => resp(400, `bad request for ${KEY}`));
    const r = await fetchOpenEtMonthly(...Q, opts(f));
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("makes no network call without a key", async () => {
    const f = vi.fn();
    const r = await fetchOpenEtMonthly(...Q, opts(f as unknown as FetchLike, { apiKey: "  " }));
    expect(f).not.toHaveBeenCalled();
    expect(r.result.status).toBe("no-key");
    expect(r.result.message).toBe(NO_KEY_MESSAGE);
  });

  it("returns no-coverage for Ludhiana without a request, even with a key", async () => {
    const f = vi.fn();
    const r = await fetchOpenEtMonthly(30.9, 75.85, opts(f as unknown as FetchLike));
    expect(f).not.toHaveBeenCalled();
    expect(r.result.status).toBe("no-coverage");
  });

  it("rejects invalid lat/lon", async () => {
    const f = vi.fn();
    expect((await fetchOpenEtMonthly(95, 10, opts(f as unknown as FetchLike))).result.reason).toBe("input");
    expect((await fetchOpenEtMonthly(10, -200, opts(f as unknown as FetchLike))).result.status).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });

  it("maps HTTP statuses", async () => {
    const run = async (status: number, body: unknown = "x") => (await fetchOpenEtMonthly(...Q, opts(vi.fn(async () => resp(status, body))))).result;
    expect(await run(401, { detail: "Invalid API Credentials" })).toMatchObject({ status: "error", reason: "auth" });
    expect(await run(403, { detail: "Not authenticated" })).toMatchObject({ status: "error", reason: "auth" });
    expect(await run(403, { detail: "Monthly query limit exceeded" })).toMatchObject({ status: "quota" });
    expect(await run(429, "slow down")).toMatchObject({ status: "quota" });
    expect(await run(400, { detail: "geometry is outside of data coverage" })).toMatchObject({ status: "no-coverage" });
    expect(await run(422, { detail: [{ msg: "bad" }] })).toMatchObject({ status: "error", reason: "validation" });
    expect(await run(500, "Internal Server Error")).toMatchObject({ status: "error", reason: "http", httpStatus: 500 });
  });

  it("retries 5xx and 429 a bounded number of times, but not 4xx", async () => {
    const f = vi.fn(async () => resp(503, "down"));
    await fetchOpenEtMonthly(...Q, opts(f, { maxRetries: 2 }));
    expect(f).toHaveBeenCalledTimes(3);
    const g = vi.fn(async () => resp(401, "no"));
    await fetchOpenEtMonthly(...Q, opts(g));
    expect(g).toHaveBeenCalledTimes(1);
    let n = 0;
    const h = vi.fn(async () => (n++ === 0 ? resp(500, "oops") : resp(200, rows(["2023-01", "2023-02", "2023-03"]))));
    expect((await fetchOpenEtMonthly(...Q, opts(h))).result.status).toBe("ok");
  });

  it("reports a timeout", async () => {
    const f: FetchLike = (_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    const r = await fetchOpenEtMonthly(...Q, opts(f, { timeoutMs: 10 }));
    expect(r.result).toMatchObject({ status: "error", reason: "timeout" });
  });

  it("reports partial when months are null or missing, and empty as no-coverage", async () => {
    const p = await fetchOpenEtMonthly(...Q, opts(vi.fn(async () => resp(200, [...rows(["2023-01"]), { time: "2023-02-01", et: null }]))));
    expect(p.result.status).toBe("partial");
    expect(p.result.coverage?.missingMonths).toEqual(["2023-02", "2023-03"]);
    const e = await fetchOpenEtMonthly(...Q, opts(vi.fn(async () => resp(200, []))));
    expect(e.result.status).toBe("no-coverage");
  });

  it("errors on non-mm units and unrecognised shapes instead of guessing", async () => {
    const u = await fetchOpenEtMonthly(...Q, opts(vi.fn(async () => resp(200, [{ time: "2023-01-01", et: 1, units: "in" }]))));
    expect(u.result).toMatchObject({ status: "error", reason: "units" });
    const s = await fetchOpenEtMonthly(...Q, opts(vi.fn(async () => resp(200, { weird: true }))));
    expect(s.result).toMatchObject({ status: "error", reason: "shape" });
  });

  it("flags provisional months (last 120 days before fetch)", async () => {
    const r = await fetchOpenEtMonthly(...Q, opts(vi.fn(async () => resp(200, rows(["2023-12", "2024-01", "2024-02", "2024-03"]))), { start: "2023-12-01", end: "2024-03-31" }));
    expect(r.result.coverage?.provisionalMonths).toEqual(["2023-12", "2024-01", "2024-02", "2024-03"]);
  });
});

describe("10-year request limit (found with the first real key)", () => {
  it("splits 2000-01-01 to 2026-10-31 into three gapless windows of at most 9 years", () => {
    const w = splitDateRange("2000-01-01", "2026-10-31");
    expect(w).toEqual([["2000-01-01", "2008-12-31"], ["2009-01-01", "2017-12-31"], ["2018-01-01", "2026-10-31"]]);
  });
  it("keeps a short range as one window and handles a mid-year start", () => {
    expect(splitDateRange("2023-01-01", "2023-03-31")).toEqual([["2023-01-01", "2023-03-31"]]);
    const w = splitDateRange("2000-06-15", "2020-01-10");
    expect(w[0][0]).toBe("2000-06-15");
    expect(w[w.length - 1][1]).toBe("2020-01-10");
    for (let i = 1; i < w.length; i++) expect(Date.parse(w[i][0]) - Date.parse(w[i - 1][1])).toBe(86_400_000);
  });
  it("makes one request per window, sends each window's own dates, and joins the records in order", async () => {
    const months = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
    const f = vi.fn(async (_u: string, init?: { body?: string }) => {
      const [s, e] = JSON.parse(init!.body!).date_range as [string, string];
      const ys = Array.from({ length: Number(e.slice(0, 4)) - Number(s.slice(0, 4)) + 1 }, (_, i) => Number(s.slice(0, 4)) + i);
      return resp(200, rows(ys.flatMap(months)));
    });
    const r = await fetchOpenEtMonthly(...Q, { apiKey: KEY, fetchImpl: f as unknown as FetchLike, now: NOW, sleep: async () => {}, start: "2000-01-01", end: "2023-12-31" });
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.chunks).toHaveLength(3);
    expect(r.result.status).toBe("ok");
    expect(r.result.series).toHaveLength(24 * 12);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  it("one failing window fails the whole fetch, never a series with a hole", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 2 ? resp(404, { detail: "Date range cannot exceed 10 years." }) : resp(200, rows(["2000-01"]))));
    const r = await fetchOpenEtMonthly(...Q, { apiKey: KEY, fetchImpl: f as unknown as FetchLike, now: NOW, sleep: async () => {}, start: "2000-01-01", end: "2023-12-31" });
    expect(r.result.status).toBe("error");
    expect(r.result.message).toMatch(/window 2009-01-01 to 2017-12-31/);
    expect(r.raw).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
