import { describe, expect, it } from "vitest";
import { DEMO_PINS } from "../demoPins";
import { CROP_CATALOG } from "./catalog";
import { cropRegionNotice, isApproxInCalifornia } from "./region";

const pin = (id: string) => DEMO_PINS.find((p) => p.id === id)!;

describe("approximate California check", () => {
  it("Brentwood and Fresno are inside, Ludhiana is outside", () => {
    expect(isApproxInCalifornia(pin("brentwood").lat, pin("brentwood").lon)).toBe(true);
    expect(isApproxInCalifornia(pin("fresno").lat, pin("fresno").lon)).toBe(true);
    expect(isApproxInCalifornia(pin("ludhiana").lat, pin("ludhiana").lon)).toBe(false);
  });
  it("clear outsiders: Reno area, Phoenix, Portland, Baja", () => {
    expect(isApproxInCalifornia(39.53, -119.8)).toBe(false);
    expect(isApproxInCalifornia(33.45, -112.07)).toBe(false);
    expect(isApproxInCalifornia(45.5, -122.7)).toBe(false);
    expect(isApproxInCalifornia(31.5, -116.6)).toBe(false);
  });
  it("clear insiders: Los Angeles, Sacramento, Imperial Valley", () => {
    expect(isApproxInCalifornia(34.05, -118.24)).toBe(true);
    expect(isApproxInCalifornia(38.58, -121.49)).toBe(true);
    expect(isApproxInCalifornia(32.85, -115.5)).toBe(true);
  });
  it("NaN is not treated as inside", () => {
    expect(isApproxInCalifornia(NaN, -120)).toBe(false);
  });
});

describe("crop region notice", () => {
  it("always carries the catalog region; warns only outside", () => {
    const inside = cropRegionNotice(pin("fresno").lat, pin("fresno").lon);
    expect(inside.region).toBe(CROP_CATALOG.region);
    expect(inside.warning).toBeNull();
    expect(inside.shortWarning).toBeNull();
    const out = cropRegionNotice(pin("ludhiana").lat, pin("ludhiana").lon);
    expect(out.outsideCalifornia).toBe(true);
    expect(out.warning).toMatch(/California/);
    expect(out.shortWarning).toMatch(/may not match local practice/);
    expect(out.warning).toMatch(/planting dates and stage lengths/i);
  });
});
