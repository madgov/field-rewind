import { describe, expect, it } from "vitest";
import { ADVISOR_OFFLINE_MESSAGE, advisorOffline } from "./offline";

describe("advisor offline switch", () => {
  it("follows FIELD_REWIND_OFFLINE", () => {
    expect(advisorOffline({ FIELD_REWIND_OFFLINE: "1" })).toBe(true);
    expect(advisorOffline({ FIELD_REWIND_OFFLINE: "on" })).toBe(true);
    expect(advisorOffline({ FIELD_REWIND_OFFLINE: "0" })).toBe(false);
    expect(advisorOffline({})).toBe(false);
  });
  it("says what it did not do", () => {
    expect(ADVISOR_OFFLINE_MESSAGE).toMatch(/not allowed to contact Google Gemini/);
    expect(ADVISOR_OFFLINE_MESSAGE).toMatch(/Nothing is sent/);
  });
});
