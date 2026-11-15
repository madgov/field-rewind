import { describe, expect, it } from "vitest";
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "@/lib/replay/examples";
import { encodeState, exampleState, nameOrDefault, parseState, rotationsAreExample, type ReplayState } from "./urlState";

const ctx = { validCropIds: new Set(["winter-wheat", "maize-grain", "cotton", "rice"]), supplyMaxMm: 1500 };
const q = (s: string) => new URLSearchParams(s);

describe("replay URL state", () => {
  it("no parameters gives the constructed example, silently", () => {
    const r = parseState(q(""), ctx);
    expect(r.notes).toEqual([]);
    expect(r.state).toEqual(exampleState());
    expect(rotationsAreExample(r.state.rotations)).toBe(true);
    expect(r.state.supplyMm).toBe(EXAMPLE_SUPPLY_MM);
  });

  it("round-trips a custom state, including awkward names", () => {
    const state: ReplayState = {
      rotations: [
        { name: "Wheat & maize, 50/50 ~ \"north\"", sequence: ["winter-wheat", "maize-grain"] },
        { name: "Cotton", sequence: ["cotton"] },
        { name: "Rice, wheat, maize", sequence: ["rice", "winter-wheat", "maize-grain"] },
      ],
      supplyMm: 840,
      year: 2003,
    };
    const back = parseState(q(encodeState(state)), ctx);
    expect(back.notes).toEqual([]);
    expect(back.state).toEqual(state);
    expect(back.fromLink).toBe(true);
    expect(rotationsAreExample(back.state.rotations)).toBe(false);
  });

  it("an encoded example is still recognised as the example", () => {
    const back = parseState(q(encodeState(exampleState(1999))), ctx);
    expect(rotationsAreExample(back.state.rotations)).toBe(true);
    expect(back.state.year).toBe(1999);
  });

  it("falls back with a note for each kind of bad input", () => {
    const badYear = parseState(q("y=1900"), ctx);
    expect(badYear.state.year).toBe(2025);
    expect(badYear.notes).toHaveLength(1);

    const badSupply = parseState(q("s=-4"), ctx);
    expect(badSupply.state.supplyMm).toBe(EXAMPLE_SUPPLY_MM);
    expect(badSupply.notes[0]).toMatch(/water supply/);
    expect(parseState(q("s=abc"), ctx).notes).toHaveLength(1);
    expect(parseState(q("s=99999"), ctx).notes).toHaveLength(1);
    expect(parseState(q("s="), ctx).notes).toHaveLength(1);

    const unknownCrop = parseState(q("r1=sunflower&r2=cotton"), ctx);
    expect(unknownCrop.state.rotations).toEqual(exampleState().rotations);
    expect(unknownCrop.notes[0]).toMatch(/sunflower/);

    expect(parseState(q("r1=cotton"), ctx).notes[0]).toMatch(/fewer than 2/);
    expect(parseState(q("r1=cotton,rice,cotton,rice&r2=rice"), ctx).notes[0]).toMatch(/1 to 3 crops/);
    expect(parseState(q("r1=&r2=rice"), ctx).notes[0]).toMatch(/1 to 3 crops/);
  });

  it("never throws on junk and keeps the valid parts", () => {
    const r = parseState(q("r1=%E0%A4%A&r2=cotton&s=500&y=2010&n1=" + "x".repeat(200)), ctx);
    expect(r.state.supplyMm).toBe(500);
    expect(r.state.year).toBe(2010);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("clamps long names and numbers a blank name", () => {
    const r = parseState(q("r1=cotton&r2=rice&n1=" + "x".repeat(200)), ctx);
    expect(r.state.rotations[0].name).toHaveLength(40);
    expect(r.state.rotations[1].name).toBe("Rotation 2");
    expect(nameOrDefault("   ", 2)).toBe("Rotation 3");
  });

  it("accepts a plain object (server searchParams) as well as URLSearchParams", () => {
    const r = parseState({ r1: "cotton", r2: ["rice", "x"], s: "600", y: "1990" }, ctx);
    expect(r.state.rotations.map((x) => x.sequence)).toEqual([["cotton"], ["rice"]]);
    expect(r.state.supplyMm).toBe(600);
  });

  it("the example matches EXAMPLE_ROTATIONS", () => {
    expect(exampleState().rotations.map((r) => r.name)).toEqual(EXAMPLE_ROTATIONS.map((r) => r.name));
  });
});
