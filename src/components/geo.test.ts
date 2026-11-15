import { describe, expect, it } from "vitest";
import { gridCell } from "@/lib/power/grid";
import { gridCellCenter } from "./geo";

describe("gridCellCenter (map display)", () => {
  it("agrees with the server grid cell, including exact ties", () => {
    for (const [lat, lon] of [[37.25, -121.75], [-37.25, 121.75], [37.93, -121.66], [0.25, -0.25], [30.9, 75.85]]) {
      const c = gridCell(lat, lon);
      expect(gridCellCenter({ lat, lon })).toEqual({ lat: c.latCenter, lon: c.lonCenter });
    }
    expect(gridCellCenter({ lat: 37.25, lon: -121.75 })).toEqual({ lat: 37.5, lon: -122 });
  });
});
