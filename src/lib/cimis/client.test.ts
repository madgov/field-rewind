import { describe, expect, it, vi } from "vitest";
import { buildCimisUrl, fetchCimis, fetchCimisUrl, CimisFetchError } from "./client";
import { splitDays } from "./dates";
import { redactText, redactUrl } from "./redact";
import { NO_KEY_MESSAGE } from "./types";
import { body, jsonRes, rec } from "./testFixtures";

const KEY = "SECRET-KEY-1234";
const noSleep = async () => {};

describe("splitDays", () => {
  it("splits inclusively at the boundary", () => {
    expect(splitDays("2020-01-01", "2020-01-10", 4)).toEqual([
      { start: "2020-01-01", end: "2020-01-04" },
      { start: "2020-01-05", end: "2020-01-08" },
      { start: "2020-01-09", end: "2020-01-10" },
    ]);
  });
  it("exactly maxDays is one chunk; one more day is two", () => {
    expect(splitDays("2020-01-01", "2020-01-04", 4)).toHaveLength(1);
    expect(splitDays("2020-01-01", "2020-01-05", 4)).toHaveLength(2);
    expect(splitDays("2020-02-28", "2020-03-01", 1)).toHaveLength(3); // leap day
  });
  it("2010-2025 at 1750 days gives 4 chunks covering every day once", () => {
    const c = splitDays("2010-01-01", "2025-12-31", 1750);
    expect(c).toHaveLength(4);
    expect(c[0].start).toBe("2010-01-01");
    expect(c[3].end).toBe("2025-12-31");
  });
  it("rejects bad input", () => {
    expect(() => splitDays("2020-01-05", "2020-01-01", 4)).toThrow();
    expect(() => splitDays("2020-13-01", "2020-01-01", 4)).toThrow();
  });
});

describe("key redaction", () => {
  it("builds the new-API URL for station 47 with no key in it", () => {
    const u = buildCimisUrl("2020-01-01", "2020-01-05");
    expect(u).toBe("https://et.water.ca.gov/StationWeb/GetDataByStationNumber?stationNbrs=47&startDate=2020-01-01&endDate=2020-01-05&isHourly=false&unitOfMeasure=M&dataItems=day-asce-eto");
    expect(u).not.toContain("appKey");
  });
  it("still redacts an appKey= value quoted in any text (legacy-style URLs in old files or errors)", () => {
    const r = redactUrl(`https://et.water.ca.gov/api/data?appKey=${KEY}&targets=47`);
    expect(r).toContain("appKey=REDACTED&targets=47");
    expect(r).not.toContain(KEY);
  });
  it("redacts a key echoed in an error body", () => {
    expect(redactText(`Invalid application key [${KEY}].`, KEY)).not.toContain(KEY);
  });
  it("sourceUrls and errors from a live fetch never contain the key", async () => {
    const ok = vi.fn(async () => jsonRes(200, body([rec("2020-01-01", "1")])));
    const a = await fetchCimis({ appKey: KEY, fetchImpl: ok, start: "2020-01-01", end: "2020-01-02" });
    expect(JSON.stringify(a)).not.toContain(KEY);
    expect(a.result.sourceUrls[0]).toContain("StationWeb/GetDataByStationNumber");
    const [reqUrl, reqInit] = ok.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(reqUrl).not.toContain(KEY); // the key is never in the URL
    expect(reqInit.headers["Ocp-Apim-Subscription-Key"]).toBe(KEY); // it travels in the header the new API requires

    const bad = vi.fn(async () => jsonRes(403, `"[ERR1006-INVALID APP KEY] Invalid application key [${KEY}]."`));
    const b = await fetchCimis({ appKey: KEY, fetchImpl: bad, start: "2020-01-01", end: "2020-01-02", sleep: noSleep });
    expect(b.result.status).toBe("error");
    expect(JSON.stringify(b)).not.toContain(KEY);
    expect(b.result.message).toMatch(/ERR1006/);
  });
  it("network error text that quotes the URL is redacted", async () => {
    const f = vi.fn(async (u: string) => {
      throw new Error(`connect failed for ${u}`);
    });
    const r = await fetchCimis({ appKey: KEY, fetchImpl: f, start: "2020-01-01", end: "2020-01-02", sleep: noSleep, maxRetries: 0 });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
});

describe("no key", () => {
  it("returns no-key with zero network calls", async () => {
    const f = vi.fn();
    for (const k of [undefined, "", "   "]) {
      const r = await fetchCimis({ appKey: k ?? "", fetchImpl: f as never });
      expect(r.result.status).toBe("no-key");
      expect(r.result.message).toBe(NO_KEY_MESSAGE);
      expect(r.result.days).toEqual([]);
    }
    expect(f).not.toHaveBeenCalled();
  });
});

describe("retry and timeout", () => {
  it("retries 5xx then succeeds", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n < 3 ? jsonRes(503, "busy") : jsonRes(200, body([rec("2020-01-01", "1")]))));
    const out = await fetchCimisUrl("https://x/?appKey=k", "k", { fetchImpl: f, sleep: noSleep });
    expect(f).toHaveBeenCalledTimes(3);
    expect(out).toBeTruthy();
  });
  it("retries 429 and network errors, gives up after maxRetries", async () => {
    const f = vi.fn(async () => jsonRes(429, "slow down"));
    await expect(fetchCimisUrl("https://x/", "k", { fetchImpl: f, sleep: noSleep, maxRetries: 2 })).rejects.toThrow(/after 3 attempts/);
    expect(f).toHaveBeenCalledTimes(3);
    const g = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchCimisUrl("https://x/", "k", { fetchImpl: g, sleep: noSleep, maxRetries: 1 })).rejects.toBeInstanceOf(CimisFetchError);
    expect(g).toHaveBeenCalledTimes(2);
  });
  it("does not retry 403, 404 or non-JSON 200", async () => {
    for (const res of [() => jsonRes(403, "no"), () => jsonRes(404, "no"), () => new Response("<html>Request Rejected</html>", { status: 200 })]) {
      const f = vi.fn(async () => res());
      await expect(fetchCimisUrl("https://x/", "k", { fetchImpl: f, sleep: noSleep })).rejects.toBeInstanceOf(CimisFetchError);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it("times out via abort and does not retry", async () => {
    const f = vi.fn((_u: string, init?: { signal?: AbortSignal }) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))));
    await expect(fetchCimisUrl("https://x/", "k", { fetchImpl: f as never, timeoutMs: 20, sleep: noSleep })).rejects.toMatchObject({ kind: "timeout" });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("fetchCimis chunking and results", () => {
  it("chunks a range, merges, status ok, sends Accept json", async () => {
    const f = vi.fn(async (u: string) => {
      const s = new URL(u).searchParams.get("startDate")!;
      return jsonRes(200, body([rec(s, "1")]));
    });
    const r = await fetchCimis({ appKey: KEY, fetchImpl: f, start: "2020-01-01", end: "2020-01-10", maxDaysPerRequest: 4 });
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.result.status).toBe("ok");
    expect(r.result.days.map((d) => d.date)).toEqual(["2020-01-01", "2020-01-05", "2020-01-09"]);
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ headers: { Accept: "application/json" } });
    const q = new URL((f.mock.calls[0] as unknown as [string])[0]).searchParams;
    expect(q.get("stationNbrs")).toBe("47");
    expect(q.get("isHourly")).toBe("false");
    expect(q.get("dataItems")).toBe("day-asce-eto");
    expect(q.get("unitOfMeasure")).toBe("M");
  });
  it("one failed chunk gives partial with failedRanges", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 2 ? jsonRes(404, "nope") : jsonRes(200, body([rec("2020-01-01", "1")]))));
    const r = await fetchCimis({ appKey: KEY, fetchImpl: f, start: "2020-01-01", end: "2020-01-10", maxDaysPerRequest: 4, sleep: noSleep });
    expect(r.result.status).toBe("partial");
    expect(r.result.failedRanges).toHaveLength(1);
    expect(r.result.failedRanges![0]).toMatchObject({ start: "2020-01-05", end: "2020-01-08" });
  });
  it("splits a chunk when the server answers ERR2112", async () => {
    const f = vi.fn(async (u: string) => {
      const p = new URL(u).searchParams;
      const days = (Date.parse(p.get("endDate")!) - Date.parse(p.get("startDate")!)) / 86400000 + 1;
      if (days > 2) return jsonRes(400, '"[ERR2112-DATA VOLUME VIOLATION] too much"');
      return jsonRes(200, body([rec(p.get("startDate")!, "1")]));
    });
    const r = await fetchCimis({ appKey: KEY, fetchImpl: f, start: "2020-01-01", end: "2020-01-04", sleep: noSleep });
    expect(r.result.status).toBe("ok");
    expect(r.raw!.responses).toHaveLength(2);
  });
  it("unit mismatch gives error, not a conversion", async () => {
    const f = vi.fn(async () => jsonRes(200, body([rec("2020-01-01", "0.05", " ", "(in)")])));
    const r = await fetchCimis({ appKey: KEY, fetchImpl: f, start: "2020-01-01", end: "2020-01-02" });
    expect(r.result.status).toBe("error");
    expect(r.result.days).toEqual([]);
  });
});
