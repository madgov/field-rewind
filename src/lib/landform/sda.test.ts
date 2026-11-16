import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SDA_NO_COVERAGE_MESSAGE, componentQuery, fetchSdaRaw, mukeyQuery, parseSdaTable, parseSoil, type SdaFetchLike } from "./sda";
import type { LandformSavedFile } from "./types";

const saved = (id: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "landform", `${id}.json`), "utf8")) as LandformSavedFile;

describe("SDA response parsing with real saved responses", () => {
  it("Brentwood: mukey 455776, Capay 85 percent, hydrologic group C, clay surface horizon", () => {
    const p = parseSoil(saved("brentwood").sda);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.mukey).toBe("455776");
    expect(p.muName).toBe("Capay clay, wet, 0 percent slopes, MLRA 17");
    const capay = p.components[0];
    expect(capay.name).toBe("Capay");
    expect(capay.pct).toBe(85);
    expect(capay.hydgrp).toBe("C");
    expect(capay.drainageClass).toBe("Moderately well drained");
    const ap = capay.horizons[0];
    expect(ap).toMatchObject({ name: "Ap", topCm: 0, bottomCm: 28, sandPct: 15, clayPct: 50, siltPct: 35, omPct: 1.5, awc: 0.15, kf: 0.24 });
    expect(capay.horizons.map((h) => h.topCm)).toEqual([...capay.horizons.map((h) => h.topCm)].sort((a, b) => a - b));
  });
  it("Fresno: mukey 464331 Hanford sandy loam, group A", () => {
    const p = parseSoil(saved("fresno").sda);
    expect(p.ok && p.mukey).toBe("464331");
    if (p.ok) {
      expect(p.components[0].hydgrp).toBe("A");
      expect(p.components[0].horizons[0]).toMatchObject({ topCm: 0, bottomCm: 41, sandPct: 68, clayPct: 12.5 });
    }
  });
  it("Ludhiana: the real SDA reply for a point outside the US is {} and becomes status no-coverage", () => {
    const raw = saved("ludhiana").sda;
    expect(raw.mukeyResponse).toEqual({});
    expect(raw.componentResponse).toBeNull();
    const p = parseSoil(raw);
    expect(p).toEqual({ ok: false, kind: "no-coverage", message: SDA_NO_COVERAGE_MESSAGE });
    expect(SDA_NO_COVERAGE_MESSAGE).toMatch(/United States only/);
  });
  it("parseSdaTable turns the column-name row into records and empty strings into null", () => {
    const t = parseSdaTable({ Table: [["a", "b"], ["1", ""], ["2", "x"]] });
    expect(t).toEqual({ ok: true, table: { columns: ["a", "b"], rows: [{ a: "1", b: null }, { a: "2", b: "x" }] } });
  });
});

describe("malformed or empty responses give structured errors", () => {
  const good = saved("brentwood").sda;
  it("rejects non-table bodies", () => {
    for (const bad of [null, "text", 5, [], { Table: "x" }, { Table: [[1, 2]] }, { Table: [["a"], ["1", "2"]] }, { other: 1 }]) {
      expect(parseSdaTable(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("a malformed map unit response is an error, not no-coverage", () => {
    const p = parseSoil({ mukeyResponse: { Table: "x" }, componentResponse: null });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.kind).toBe("error");
  });
  it("a mukey with an empty component response is an error", () => {
    const p = parseSoil({ mukeyResponse: good.mukeyResponse, componentResponse: {} });
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.kind).toBe("error");
      expect(p.message).toMatch(/no components/);
    }
  });
  it("a component response missing a required column is an error", () => {
    const p = parseSoil({ mukeyResponse: good.mukeyResponse, componentResponse: { Table: [["mukey"], ["455776"]] } });
    expect(p.ok).toBe(false);
  });
  it("a non-numeric mukey is rejected before it can reach a query", () => {
    expect(() => componentQuery("1; DROP TABLE x")).toThrow();
    expect(parseSoil({ mukeyResponse: { Table: [["mukey"], ["abc"]] }, componentResponse: null }).ok).toBe(false);
  });
});

describe("SDA client", () => {
  const res = (body: string, status = 200) => ({ ok: status < 400, status, text: async () => body });
  it("asks for lon lat in WKT and stops after step 1 when there is no map unit", async () => {
    const f = vi.fn<SdaFetchLike>(async () => res("{}"));
    const raw = await fetchSdaRaw(30.9, 75.85, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.mock.calls[0][1]!.body!).query).toBe(mukeyQuery(30.9, 75.85));
    expect(mukeyQuery(30.9, 75.85)).toContain("point(75.85 30.9)");
    expect(raw.componentQuery).toBeNull();
  });
  it("treats an empty body like {} and reports a service exception as an error", async () => {
    expect((await fetchSdaRaw(1, 1, { fetchImpl: async () => res("") })).mukeyResponse).toEqual({});
    await expect(fetchSdaRaw(1, 1, { fetchImpl: async () => res("<ServiceException>Invalid query</ServiceException>") })).rejects.toThrow(/Invalid query/);
    await expect(fetchSdaRaw(1, 1, { fetchImpl: async () => res("boom", 500) })).rejects.toThrow(/HTTP 500/);
  });
  it("runs the component query with the returned mukey", async () => {
    const f = vi.fn<SdaFetchLike>(async (_u, init) => res(JSON.stringify(init!.body!.includes("SDA_Get_Mukey") ? { Table: [["mukey"], ["455776"]] } : { Table: [["mukey"]] })));
    const raw = await fetchSdaRaw(37.93, -121.66, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(raw.componentQuery).toContain("mu.mukey='455776'");
  });
});
