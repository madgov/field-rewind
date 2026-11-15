import { describe, expect, it } from "vitest";
import { exampleInputsNote } from "./printText";

describe("exampleInputsNote", () => {
  it("says both only when both match", () => {
    expect(exampleInputsNote(true, true)).toBe("The rotations and supply shown are the built-in example.");
  });
  it("words rotations-only and supply-only per what matches", () => {
    expect(exampleInputsNote(true, false)).toMatch(/rotations shown are the built-in example; the water supply was changed/);
    expect(exampleInputsNote(false, true)).toMatch(/supply shown is the built-in example supply; the rotations were changed/);
    expect(exampleInputsNote(true, false)).not.toMatch(/rotations and supply/);
  });
  it("says nothing when neither matches", () => {
    expect(exampleInputsNote(false, false)).toBeNull();
  });
});
