import { describe, expect, it } from "vitest";
import { cdlUrl, parseCdlBody, toAlbers5070 } from "./landuse";

describe("CDL point check", () => {
  it("projects to EPSG:5070 the same way the NASS service echoes it (real reply for 36.68, -119.28)", () => {
    const p = toAlbers5070(36.68, -119.28);
    expect(p.x).toBeCloseTo(-2040607.9, 0);
    expect(p.y).toBeCloseTo(1766101.5, 0);
    expect(cdlUrl(2023, 36.68, -119.28)).toBe("https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=2023&x=-2040607.9&y=1766101.5");
  });
  it("parses a real service reply", () => {
    const body = '<ns1:GetCDLValueResponse xmlns:ns1="http://cropscape.csiss.gmu.edu/CDLService/"><Result>{x: -2040607.9, y: 1766101.5, value: 176, category: "Grass/Pasture", color: "#E9FFBE"}</Result></ns1:GetCDLValueResponse>';
    expect(parseCdlBody(body)).toEqual({ value: "176", category: "Grass/Pasture" });
    expect(parseCdlBody("<html>nope</html>")).toBeNull();
  });
});
