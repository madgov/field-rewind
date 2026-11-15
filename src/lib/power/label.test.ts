import { describe, expect, it } from "vitest";
import { formatUtc, powerDataLabel, powerOriginLine } from "./label";

const at = "2026-11-15T06:33:12.000Z";

describe("power origin wording (one function for every screen)", () => {
  it("saved: says Saved response from the real fetch date", () => {
    expect(powerOriginLine({ origin: "saved", fetchedAt: at })).toBe("Saved response from 15 Nov 2026, 06:33 UTC.");
  });
  it("cache: also says Saved response, never 'fetched ... (cached)'", () => {
    const line = powerOriginLine({ origin: "cache", fetchedAt: at });
    expect(line).toBe("Saved response from 15 Nov 2026, 06:33 UTC.");
    expect(line).not.toMatch(/cached|just now/i);
  });
  it("live: only live may say fetched just now, with its time", () => {
    expect(powerOriginLine({ origin: "live", fetchedAt: at })).toBe("Fetched from NASA POWER just now, 15 Nov 2026, 06:33 UTC.");
  });
  it("data label follows the same wording and keeps the 50 km label", () => {
    expect(powerDataLabel({ origin: "saved", fetchedAt: at })).toBe("Saved response from 15 Nov 2026, 06:33 UTC (NASA POWER regional climate, about 50 km grid)");
    expect(powerDataLabel({ origin: "cache", fetchedAt: at })).toMatch(/^Saved response from 15 Nov 2026/);
    expect(powerDataLabel({ origin: "live", fetchedAt: at })).toMatch(/^Fetched from NASA POWER just now/);
  });
  it("formatUtc flags unreadable dates", () => {
    expect(formatUtc("nope")).toContain("unreadable");
  });
});
