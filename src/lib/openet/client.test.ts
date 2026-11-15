import { describe, expect, it, vi } from "vitest";
import { buildOpenEtBody, fetchOpenEtMonthly, type FetchLike } from "./client";
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
