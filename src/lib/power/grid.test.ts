import { describe, expect, it } from "vitest";
import { gridCell, roundToHalf, validateCoordinates } from "./grid";

describe("gridCell", () => {
  it("positive and negative coordinates", () => {
    expect(gridCell(37.93, -121.66)).toEqual({ key: "38.0_-121.5", latCenter: 38, lonCenter: -121.5 });
    expect(gridCell(30.9, 75.85)).toEqual({ key: "31.0_76.0", latCenter: 31, lonCenter: 76 });
    expect(gridCell(-33.8, -70.3)).toEqual({ key: "-34.0_-70.5", latCenter: -34, lonCenter: -70.5 });
    expect(gridCell(36.74, -119.79).key).toBe("36.5_-120.0");
  });
  it("boundaries and ties", () => {
    expect(gridCell(90, 180).key).toBe("90.0_180.0");
    expect(gridCell(-90, -180).key).toBe("-90.0_-180.0");
    expect(roundToHalf(0.25)).toBe(0.5);
    expect(roundToHalf(-0.25)).toBe(-0.5);
    expect(roundToHalf(0.249)).toBe(0);
    expect(Object.is(roundToHalf(-0.1), 0)).toBe(true); // no negative zero
    expect(gridCell(-0.1, 0.1).key).toBe("0.0_0.0");
  });
  it("tie case rounds away from zero, matching the map's displayed cell", () => {
    expect(gridCell(37.25, -121.75)).toEqual({ key: "37.5_-122.0", latCenter: 37.5, lonCenter: -122 });
    expect(gridCell(-37.25, 121.75).key).toBe("-37.5_122.0");
  });
  it("nearby points share a cell", () => {
    expect(gridCell(37.8, -121.7).key).toBe(gridCell(37.93, -121.66).key);
  });
});

describe("validateCoordinates", () => {
  it("accepts boundaries and rejects bad values", () => {
    expect(validateCoordinates(90, 180)).toBeNull();
    expect(validateCoordinates(-90, -180)).toBeNull();
    expect(validateCoordinates(90.01, 0)).toMatch(/latitude/);
    expect(validateCoordinates(0, -180.5)).toMatch(/longitude/);
    expect(validateCoordinates(NaN, 0)).toMatch(/latitude/);
    expect(validateCoordinates(0, Infinity)).toMatch(/longitude/);
  });
});
