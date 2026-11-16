import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./http";
import { TokenManager } from "./token";

const tokenFetch = (tokens: { token: string; expiry: string }[]) => {
  let i = 0;
  return vi.fn<FetchLike>(async () => {
    const t = tokens[Math.min(i++, tokens.length - 1)];
    return new Response(JSON.stringify({ token: t.token, "msft:expiry": t.expiry }), { status: 200 });
  });
};

describe("TokenManager with an injected clock", () => {
  it("reuses a token until 5 minutes before expiry, then refreshes", async () => {
    let now = Date.parse("2026-01-01T00:00:00Z");
    const f = tokenFetch([
      { token: "A", expiry: "2026-01-01T01:00:00Z" },
      { token: "B", expiry: "2026-01-01T02:00:00Z" },
    ]);
    const m = new TokenManager({ fetchImpl: f, now: () => now, sleep: async () => {} });
    expect(await m.get()).toBe("A");
    now += 54 * 60_000; // 6 minutes left
    expect(await m.get()).toBe("A");
    expect(f).toHaveBeenCalledTimes(1);
    now += 2 * 60_000; // 4 minutes left, inside the margin
    expect(await m.get()).toBe("B");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("shares one refresh between concurrent callers", async () => {
    const f = tokenFetch([{ token: "A", expiry: "2026-01-01T01:00:00Z" }]);
    const m = new TokenManager({ fetchImpl: f, now: () => Date.parse("2026-01-01T00:00:00Z"), sleep: async () => {} });
    const r = await Promise.all([m.get(), m.get(), m.get()]);
    expect(r).toEqual(["A", "A", "A"]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("invalidate() forces a new fetch", async () => {
    const f = tokenFetch([
      { token: "A", expiry: "2026-01-01T01:00:00Z" },
      { token: "B", expiry: "2026-01-01T01:00:00Z" },
    ]);
    const m = new TokenManager({ fetchImpl: f, now: () => Date.parse("2026-01-01T00:00:00Z"), sleep: async () => {} });
    await m.get();
    m.invalidate();
    expect(await m.get()).toBe("B");
  });
  it("uses a 1 hour lifetime when the expiry is missing, and retries a 503", async () => {
    let n = 0;
    const f = vi.fn<FetchLike>(async () => (n++ === 0 ? new Response("x", { status: 503 }) : new Response(JSON.stringify({ token: "T" }), { status: 200 })));
    let now = 0;
    const m = new TokenManager({ fetchImpl: f, now: () => now, sleep: async () => {} });
    expect(await m.get()).toBe("T");
    expect(f).toHaveBeenCalledTimes(2);
    now = 56 * 60_000;
    await m.get();
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("throws when the response has no token", async () => {
    const f = vi.fn<FetchLike>(async () => new Response("{}", { status: 200 }));
    await expect(new TokenManager({ fetchImpl: f, sleep: async () => {} }).get()).rejects.toThrow(/no token/);
  });
});
