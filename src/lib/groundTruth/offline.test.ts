import { describe, expect, it, vi } from "vitest";
import { createGroundTruthService, GROUND_OFFLINE_MESSAGE } from "./service";
import type { FetchLike } from "./http";
import { cropHistoryWording, groundCheckWording } from "./wording";
import { GROUND_TRUTH_LABEL } from "./label";

const throwingFetch = () =>
  vi.fn<FetchLike>(async () => {
    throw new Error("fetch must not be called");
  });
const noPower = vi.fn(async () => {
  throw new Error("POWER must not be called");
});

describe("offline switch", () => {
  it("serves saved demo pins and never calls fetch or POWER", async () => {
    const f = throwingFetch();
    const svc = createGroundTruthService({ offline: true, http: { fetchImpl: f }, getPower: noPower });
    for (const [lat, lon, id] of [[37.93, -121.66, "brentwood"], [36.74, -119.79, "fresno"], [30.9, 75.85, "ludhiana"]] as const) {
      const r = await svc.getGroundTruth(lat, lon);
      expect(r.status).toBe("ok");
      if (r.status === "ok") {
        expect(r.origin).toBe("saved");
        expect(r.pinId).toBe(id);
      }
    }
    expect(f).not.toHaveBeenCalled();
    expect(noPower).not.toHaveBeenCalled();
  });

  it("returns a structured plain-English error for an unsaved point, with no network call", async () => {
    const f = throwingFetch();
    const svc = createGroundTruthService({ offline: true, http: { fetchImpl: f }, getPower: noPower });
    const r = await svc.getGroundTruth(41.5, -93.6);
    expect(r).toEqual({ status: "error", lat: 41.5, lon: -93.6, message: GROUND_OFFLINE_MESSAGE });
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a fresh refetch of a saved place while offline", async () => {
    const f = throwingFetch();
    const svc = createGroundTruthService({ offline: true, http: { fetchImpl: f }, getPower: noPower });
    const r = await svc.getGroundTruth(37.93, -121.66, { fresh: true });
    expect(r.status).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects impossible coordinates and unknown pin ids", async () => {
    const svc = createGroundTruthService({ offline: true });
    expect((await svc.getGroundTruth(100, 0)).status).toBe("error");
    expect((await svc.loadSavedGroundTruth("atlantis")).status).toBe("error");
  });

  it("reports a missing saved file as an error, not as empty data", async () => {
    const svc = createGroundTruthService({ offline: true, savedDir: "/nonexistent-dir-for-test" });
    const r = await svc.loadSavedGroundTruth("brentwood");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toMatch(/could not be read/);
  });
});

describe("real saved files", () => {
  const svc = createGroundTruthService({ offline: true });
  const bad = /NaN|undefined|Infinity|\[object/;

  it.each(["brentwood", "fresno", "ludhiana"])("%s: loads and all wording is free of NaN/undefined", async (id) => {
    const r = await svc.loadSavedGroundTruth(id);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const text = JSON.stringify([groundCheckWording(r), cropHistoryWording(r)]);
    expect(text).not.toMatch(bad);
    expect(GROUND_TRUTH_LABEL).toMatch(/Not an accuracy claim/);
    for (const l of [r.daymet, r.gauge, r.cdl, r.nlcd, r.wells]) {
      expect(["ok", "no-coverage", "not-checked"]).toContain(l.status);
      expect(l.source.citation.length).toBeGreaterThan(20);
      expect(Number.isNaN(Date.parse(l.fetchedAt))).toBe(false);
    }
    // saved data must be labelled as saved, never as just fetched
    const labels = [...groundCheckWording(r).labels, ...cropHistoryWording(r).labels].join("\n");
    expect(labels).not.toMatch(/just now/);
    if (r.daymet.status === "ok") expect(labels).toMatch(/Saved response from \d{1,2} \w{3} \d{4}/);
  });

  it("brentwood: numbers are internally consistent", async () => {
    const r = await svc.loadSavedGroundTruth("brentwood");
    if (r.status !== "ok" || !r.daymet.data || !r.gauge.data || !r.cdl.data) throw new Error("expected ok layers");
    const a = r.daymet.data.precipAnnual;
    expect(a.rows).toHaveLength(40);
    expect(a.rows[0]?.year).toBe(1985);
    expect(a.rows[39]?.year).toBe(2024);
    expect(r.daymet.data.droppedLeapDec31).toBe(10); // 1988 ... 2020 leap years in 1985-2024
    expect(r.daymet.data.pairedDays).toBe(40 * 365);
    const sumP = a.rows.reduce((s, x) => s + x.powerMm, 0);
    const sumD = a.rows.reduce((s, x) => s + x.daymetMm, 0);
    expect(a.ratioOfTotals).toBeCloseTo(sumP / sumD, 10);
    expect(a.biasMmPerYear).toBeCloseTo((sumP - sumD) / 40, 10);
    expect(r.gauge.data.station.id).toBe("CA-CC-36");
    expect(r.gauge.data.power.n).toBeLessThanOrEqual(r.gauge.data.reportedDays);
    expect(r.cdl.data.years).toHaveLength(17);
    expect(r.nlcd.data?.name).toBe("Cultivated Crops");
    expect(r.gauge.data.daysWithoutReport).toBeGreaterThan(0);
  });

  it("ludhiana: every layer is a structured no-coverage with a message, nothing invented", async () => {
    const r = await svc.loadSavedGroundTruth("ludhiana");
    if (r.status !== "ok") throw new Error("expected ok");
    for (const l of [r.daymet, r.gauge, r.cdl, r.nlcd, r.wells]) {
      expect(l.status).toBe("no-coverage");
      expect(l.data).toBeNull();
      expect(l.message.length).toBeGreaterThan(20);
    }
  });

  it("fresno: crop wording says Developed, not a crop", async () => {
    const r = await svc.loadSavedGroundTruth("fresno");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(cropHistoryWording(r).cdl.join(" ")).toMatch(/Developed \(built-up\) class/);
  });
});
