import { describe, expect, it } from "vitest";
import { compassName, deriveTerrain, hornSlopeAspect, metersPerDegree, relativeElevation, slopePercentFromDegrees } from "./terrain";
import type { TerrainRaw } from "./types";

const deg = (rad: number) => (rad * 180) / Math.PI;

describe("Horn slope and aspect on hand-computed planes (spacing 30 m)", () => {
  it("ground rising to the south by 30 m per 30 m cell: slope atan(0.5), faces north", () => {
    // rows are north to south: a b c / d e f / g h i
    const r = hornSlopeAspect([0, 0, 0, 15, 15, 15, 30, 30, 30], 30, 30);
    // dz/dy (north positive) = ((0+0+0) - (30+60+30)) / 240 = -0.5, dz/dx = 0
    expect(r.slopeDeg).toBeCloseTo(deg(Math.atan(0.5)), 9);
    expect(r.aspectDeg).toBeCloseTo(0, 9);
  });
  it("ground rising to the east: faces west (270)", () => {
    const r = hornSlopeAspect([0, 15, 30, 0, 15, 30, 0, 15, 30], 30, 30);
    expect(r.slopeDeg).toBeCloseTo(deg(Math.atan(0.5)), 9);
    expect(r.aspectDeg).toBeCloseTo(270, 9);
  });
  it("ground rising to the north: faces south (180)", () => {
    const r = hornSlopeAspect([30, 30, 30, 15, 15, 15, 0, 0, 0], 30, 30);
    expect(r.aspectDeg).toBeCloseTo(180, 9);
  });
  it("ground rising to the west: faces east (90)", () => {
    const r = hornSlopeAspect([30, 15, 0, 30, 15, 0, 30, 15, 0], 30, 30);
    expect(r.aspectDeg).toBeCloseTo(90, 9);
  });
  it("z = x + y (rising to the north-east, 1 m per m each way): slope atan(sqrt 2), faces south-west (225)", () => {
    // x = -30,0,30 and y = +30,0,-30 down the rows: a=0 b=30 c=60 / d=-30 e=0 f=30 / g=-60 h=-30 i=0
    const r = hornSlopeAspect([0, 30, 60, -30, 0, 30, -60, -30, 0], 30, 30);
    expect(r.slopeDeg).toBeCloseTo(deg(Math.atan(Math.SQRT2)), 9);
    expect(r.aspectDeg).toBeCloseTo(225, 9);
  });
  it("uses different east-west and north-south spacing correctly (24 m by 30 m)", () => {
    // rises 24 m per 24 m cell to the east: gradient exactly 1 -> 45 degrees
    const r = hornSlopeAspect([0, 24, 48, 0, 24, 48, 0, 24, 48], 24, 30);
    expect(r.slopeDeg).toBeCloseTo(45, 9);
    const ns = hornSlopeAspect([60, 60, 60, 30, 30, 30, 0, 0, 0], 24, 30); // rises 30 m per 30 m to the north
    expect(ns.slopeDeg).toBeCloseTo(45, 9);
  });
  it("flat ground has slope 0 and no aspect", () => {
    expect(hornSlopeAspect([5, 5, 5, 5, 5, 5, 5, 5, 5], 30, 30)).toEqual({ slopeDeg: 0, aspectDeg: null });
  });
  it("percent from degrees: 45 degrees is 100 percent", () => {
    expect(slopePercentFromDegrees(45)).toBeCloseTo(100, 9);
  });
});

describe("meters per degree", () => {
  it("matches known WGS84 values", () => {
    expect(metersPerDegree(0).lat).toBeCloseTo(110574, -1);
    expect(metersPerDegree(0).lon).toBeCloseTo(111319.5, -1);
    expect(metersPerDegree(45).lat).toBeCloseTo(111132, -1);
    expect(metersPerDegree(60).lon).toBeCloseTo(55800, -2);
  });
});

/** A tilted plane window: z = gx * east_m + gy * north_m + z0, built on the same lattice the client reads. */
function planeRaw(gx: number, gy: number, lat = 37.93, size = 43): TerrainRaw {
  const res = 1 / 3600;
  const m = metersPerDegree(lat);
  const elevationM: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const east = (c - 21) * res * m.lon;
      const north = (21 - r) * res * m.lat;
      elevationM.push(100 + gx * east + gy * north);
    }
  }
  return {
    tileId: "TEST", stacSearchUrl: "x", assetUrl: "x", fetchedAt: "2026-01-01T00:00:00.000Z", pinLat: lat, pinLon: -121.66,
    windowRows: size, windowCols: size, resDegLon: res, resDegLat: res,
    windowWest: -121.66 - 21.5 * res, windowNorth: lat + 21.5 * res, elevationM, noData: -32768,
  };
}

describe("deriveTerrain on a tilted plane", () => {
  it("recovers slope and aspect everywhere (rising east 10 percent => faces west)", () => {
    const d = deriveTerrain(planeRaw(0.1, 0));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.grid.rows).toBe(41);
    expect(d.grid.cols).toBe(41);
    for (let i = 0; i < d.grid.slopeDeg.length; i++) {
      expect(d.grid.slopeDeg[i]).toBeCloseTo(deg(Math.atan(0.1)), 1); // stored to 0.01 degree
      expect(d.grid.aspectDeg[i]).toBe(270);
    }
    expect(d.summary.centerSlopePct).toBeCloseTo(10, 0);
    expect(d.summary.centerAspectDeg).toBe(270);
  });
  it("rising to the north-east at 5 percent each way faces south-west", () => {
    const d = deriveTerrain(planeRaw(0.05, 0.05));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.summary.centerAspectDeg).toBe(225);
    expect(d.summary.centerSlopePct).toBeCloseTo(7.1, 1); // 100 * sqrt(0.05^2 + 0.05^2)
  });
  it("bounds are cell edges of the 41 x 41 grid around the pin", () => {
    const d = deriveTerrain(planeRaw(0, 0));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const res = 1 / 3600;
    expect(d.grid.bounds.east - d.grid.bounds.west).toBeCloseTo(41 * res, 9);
    expect(d.grid.bounds.north - d.grid.bounds.south).toBeCloseTo(41 * res, 9);
    expect(d.grid.centerLon).toBeCloseTo(-121.66, 3);
    expect((d.grid.bounds.west + d.grid.bounds.east) / 2).toBeCloseTo(d.grid.centerLon, 9);
    expect(d.summary.centerAspectDeg).toBeNull();
    expect(d.summary.centerSlopePct).toBe(0);
  });
  it("refuses a window with no-data cells or the wrong length, with a plain message", () => {
    const raw = planeRaw(0, 0);
    raw.elevationM[500] = -32768;
    const bad = deriveTerrain(raw);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/missing/);
    const short = planeRaw(0, 0);
    short.elevationM.pop();
    const d2 = deriveTerrain(short);
    expect(d2.ok).toBe(false);
  });
  it("relative elevation is height above the lowest cell", () => {
    const d = deriveTerrain(planeRaw(0.1, 0));
    if (!d.ok) throw new Error("x");
    const rel = relativeElevation(d.grid);
    expect(Math.min(...rel)).toBe(0);
    expect(Math.max(...rel)).toBe(d.summary.reliefM);
  });
  it("compass names", () => {
    expect(compassName(0)).toBe("north");
    expect(compassName(270)).toBe("west");
    expect(compassName(359)).toBe("north");
    expect(compassName(225)).toBe("southwest");
  });
});
