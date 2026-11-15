import { describe, expect, it } from "vitest";
import { cToF, formatDays, formatInches, formatMm, formatTempC, formatTempF, mmToInches } from "./units";

describe("units", () => {
  it("converts mm to inches", () => {
    expect(mmToInches(25.4)).toBeCloseTo(1, 10);
    expect(mmToInches(0)).toBe(0);
    expect(mmToInches(1287)).toBeCloseTo(50.669, 3);
  });
  it("converts C to F", () => {
    expect(cToF(35)).toBe(95);
    expect(cToF(0)).toBe(32);
    expect(cToF(-40)).toBe(-40);
  });
  it("formats", () => {
    expect(formatMm(1287)).toBe("1,287 mm");
    expect(formatMm(-0.2)).toBe("0 mm");
    expect(formatInches(254)).toBe("10.0 in");
    expect(formatTempC(35)).toBe("35 °C");
    expect(formatTempF(35)).toBe("95 °F");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(12)).toBe("12 days");
  });
});
