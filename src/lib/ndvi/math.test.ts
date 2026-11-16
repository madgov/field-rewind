import { describe, expect, it } from "vitest";
import { ndviFromDn, ndviFromReflectance, qaRejects, satelliteName, srDnValid, toReflectance } from "./math";

describe("scale factors", () => {
  it("applies 0.0000275 and -0.2 (hand computed)", () => {
    expect(toReflectance(10000)).toBeCloseTo(0.075, 10);
    expect(toReflectance(30000)).toBeCloseTo(0.625, 10);
    expect(toReflectance(7273)).toBeCloseTo(0.0000075, 6);
  });
  it("NDVI of reflectances 0.075 (red) and 0.625 (NIR) is 0.55/0.70", () => {
    expect(ndviFromReflectance(0.075, 0.625)).toBeCloseTo(0.5 / 0.7 + 0.05 / 0.7, 10); // 0.785714...
    expect(ndviFromReflectance(0.075, 0.625)).toBeCloseTo(0.785714, 5);
  });
  it("equal red and NIR gives 0; NIR below red is negative; zero sum is null", () => {
    expect(ndviFromReflectance(0.3, 0.3)).toBe(0);
    expect(ndviFromReflectance(0.4, 0.1)).toBeCloseTo(-0.6, 10);
    expect(ndviFromReflectance(0, 0)).toBeNull();
  });
  it("ndviFromDn goes DN -> reflectance -> NDVI (red 10000, NIR 30000, clear)", () => {
    expect(ndviFromDn(10000, 30000, 64)).toBeCloseTo(0.785714, 5);
  });
});

describe("DN validity", () => {
  it("rejects fill (0) and saturated (65535), accepts 1..65455", () => {
    expect(srDnValid(0)).toBe(false);
    expect(srDnValid(1)).toBe(true);
    expect(srDnValid(65455)).toBe(true);
    expect(srDnValid(65535)).toBe(false);
    expect(ndviFromDn(0, 30000, 64)).toBeNull();
    expect(ndviFromDn(10000, 65535, 64)).toBeNull();
  });
});

describe("QA_PIXEL bit masking", () => {
  const bit = (n: number) => 1 << n;
  it("accepts a clear land pixel (bit 6) and a clear water pixel (bits 6+7)", () => {
    expect(qaRejects(bit(6))).toBe(false);
    expect(qaRejects(bit(6) | bit(7))).toBe(false);
  });
  it.each([
    ["fill", 0],
    ["dilated cloud", 1],
    ["cirrus", 2],
    ["cloud", 3],
    ["cloud shadow", 4],
    ["snow/ice", 5],
  ])("rejects %s (bit %i)", (_n, b) => {
    expect(qaRejects(bit(6) | bit(b))).toBe(true);
    expect(ndviFromDn(10000, 30000, bit(6) | bit(b))).toBeNull();
  });
  it("confidence bits (8+) alone do not reject", () => {
    expect(qaRejects(bit(6) | bit(8) | bit(9))).toBe(false);
  });
});

describe("satelliteName", () => {
  it("formats platform ids", () => {
    expect(satelliteName("landsat-8")).toBe("Landsat 8");
    expect(satelliteName("landsat-5")).toBe("Landsat 5");
    expect(satelliteName(undefined)).toBe("Landsat (unknown)");
  });
});
