import { describe, expect, it } from "vitest";
import { cropIndexForYear, replay } from "./replay";
import { fixtureCrop, makePower } from "./testFixtures";
import type { ReplayOk, ReplayResult } from "./types";

const A = fixtureCrop({ id: "a", name: "Crop A", kc: [1, 1, 1], days: [10, 10, 10, 10], plant: "06-01" });
const B = fixtureCrop({ id: "b", name: "Crop B", kc: [0.5, 0.5, 0.5], days: [10, 10, 10, 10], plant: "06-01" });
const C = fixtureCrop({ id: "c", name: "Crop C", kc: [0.7, 0.7, 0.7], days: [10, 10, 10, 10], plant: "06-01" });
const crops = [A, B, C];

// Constant mild weather: ET0 comes from the real FAO-56 code. Rain on 1 June each year varies by year so needs differ by year.
const power = makePower({
  precip: (iso) => {
    if (iso.slice(5, 10) !== "06-01") return 0;
    const y = Number(iso.slice(0, 4));
    return (y % 37) * 1.5; // 0 .. 54 mm, different every few years
  },
});

function ok(r: ReplayResult): ReplayOk {
  if (r.status !== "ok") throw new Error(`unavailable: ${r.reason}`);
  return r;
}
const rot = (name: string, sequence: string[]) => ({ name, sequence });

describe("rotation indexing", () => {
  it("cropIndexForYear: (Y - 1986) mod length", () => {
    expect(cropIndexForYear(1, 2025)).toBe(0);
    expect(cropIndexForYear(2, 1986)).toBe(0);
    expect(cropIndexForYear(2, 1987)).toBe(1);
    expect(cropIndexForYear(3, 1988)).toBe(2);
    expect(cropIndexForYear(3, 1989)).toBe(0);
    expect(cropIndexForYear(3, 2025)).toBe((2025 - 1986) % 3);
  });

  it("40 seasons per rotation, in order, using the right crop for sequences of length 1, 2 and 3", () => {
    const r = ok(replay(power, crops, { supplyMm: 150, rotations: [rot("one", ["a"]), rot("two", ["a", "b"]), rot("three", ["a", "b", "c"])] }));
    expect(r.rotations).toHaveLength(3);
    for (const x of r.rotations) {
      expect(x.seasons).toHaveLength(40);
      expect(x.seasons.map((s) => s.year)).toEqual(Array.from({ length: 40 }, (_, i) => 1986 + i));
    }
    expect(r.rotations[0].seasons.every((s) => s.cropId === "a")).toBe(true);
    const two = r.rotations[1].seasons.map((s) => s.cropId);
    expect(two.slice(0, 4)).toEqual(["a", "b", "a", "b"]);
    expect(two[39]).toBe("b"); // 2025: (2025-1986)=39 -> odd -> b
    const three = r.rotations[2].seasons.map((s) => s.cropId);
    expect(three.slice(0, 7)).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
    expect(three[39]).toBe("a"); // 39 mod 3 = 0
  });
});

describe("supply changes the result", () => {
  it("a season flips from short to green when the supply rises across its need, and decade counts change to match", () => {
    const base = ok(replay(power, crops, { supplyMm: 1000, rotations: [rot("A", ["a"]), rot("B", ["b"])] }));
    const needs = base.rotations[0].seasons.map((s) => s.needMm as number);
    expect(new Set(needs.map((n) => n.toFixed(6))).size).toBeGreaterThan(5);
    const y2000 = needs[2000 - 1986];
    const lo = y2000 - 0.001;
    const hi = y2000 + 0.001;
    const low = ok(replay(power, crops, { supplyMm: lo, rotations: [rot("A", ["a"]), rot("B", ["b"])] })).rotations[0];
    const high = ok(replay(power, crops, { supplyMm: hi, rotations: [rot("A", ["a"]), rot("B", ["b"])] })).rotations[0];
    expect(low.seasons[2000 - 1986].outcome).toBe("short");
    expect(high.seasons[2000 - 1986].outcome).toBe("ok");
    const flipped = needs.filter((n) => n > lo && n <= hi).length;
    expect(flipped).toBeGreaterThanOrEqual(1);
    // decade 1996-2005 is index 1: its short count falls by the number of its seasons that flipped
    const flippedIn = (from: number, to: number) => needs.filter((n, i) => 1986 + i >= from && 1986 + i <= to && n > lo && n <= hi).length;
    expect(low.decades[1].short - high.decades[1].short).toBe(flippedIn(1996, 2005));
    expect(low.decades[1].short - high.decades[1].short).toBeGreaterThanOrEqual(1);
    expect(low.totals.short - high.totals.short).toBe(flipped);
    // counts always add up
    for (const d of [...low.decades, ...high.decades]) {
      expect(d.short + d.ok + d.insufficient).toBe(d.seasons);
      expect(d.evaluable).toBe(d.short + d.ok);
    }
    // wording follows the counts
    expect(low.headline).toContain(`${low.decades[0].short} of 10 seasons in 1986–1995`);
    expect(low.headline).toContain(`${low.decades[3].short} of 10 in 2016–2025`);
  });

  it("zero supply: every season with any need is short; a huge supply: none", () => {
    const zero = ok(replay(power, crops, { supplyMm: 0, rotations: [rot("A", ["a"]), rot("B", ["b"])] }));
    expect(zero.rotations[0].totals.short).toBe(40);
    const huge = ok(replay(power, crops, { supplyMm: 1e9, rotations: [rot("A", ["a"]), rot("B", ["b"])] }));
    expect(huge.rotations[0].totals.short).toBe(0);
    expect(huge.rotations[0].sentence).toMatch(/never short/);
  });

  it("reuses the climate: the second run on the same PowerResult is much cheaper", () => {
    const p = makePower({});
    const t0 = performance.now();
    replay(p, crops, { supplyMm: 100, rotations: [rot("A", ["a"]), rot("B", ["b", "c"])] });
    const first = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) replay(p, crops, { supplyMm: 50 + i * 10, rotations: [rot("A", ["a"]), rot("B", ["b", "c"])] });
    const each = (performance.now() - t1) / 20;
    expect(each).toBeLessThan(first);
    expect(each).toBeLessThan(20);
  });
});

describe("input validation and unavailable results", () => {
  const rots = [rot("A", ["a"]), rot("B", ["b"])];
  it("rejects an unusable crop with the reason, never skipping it", () => {
    const bad = fixtureCrop({ id: "bad", name: "Mystery crop", kc: [0.4, null, 0.6] });
    const r = replay(power, [...crops, bad], { supplyMm: 100, rotations: [rot("A", ["a"]), rot("B", ["a", "bad"])] });
    expect(r.status).toBe("unavailable");
    if (r.status !== "unavailable") return;
    expect(r.cause).toBe("invalid-input");
    expect(r.reason).toMatch(/Mystery crop has no sourced value for: Kc mid/);
  });
  it("rejects an unknown crop id", () => {
    const r = replay(power, crops, { supplyMm: 100, rotations: [rot("A", ["a"]), rot("B", ["zzz"])] });
    expect(r.status === "unavailable" && r.reason).toMatch(/no crop with the id "zzz"/);
  });
  it("rejects bad supply: negative, NaN, infinite", () => {
    for (const s of [-1, NaN, Infinity]) {
      const r = replay(power, crops, { supplyMm: s, rotations: rots });
      expect(r.status).toBe("unavailable");
    }
    expect(replay(power, crops, { supplyMm: 0, rotations: rots }).status).toBe("ok");
  });
  it("rejects 1 or 4 rotations and sequences of 0 or 4 crops", () => {
    expect(replay(power, crops, { supplyMm: 100, rotations: [rot("A", ["a"])] }).status).toBe("unavailable");
    expect(replay(power, crops, { supplyMm: 100, rotations: [...rots, rot("C", ["c"]), rot("D", ["a"])] }).status).toBe("unavailable");
    expect(replay(power, crops, { supplyMm: 100, rotations: [rot("A", []), rot("B", ["b"])] }).status).toBe("unavailable");
    expect(replay(power, crops, { supplyMm: 100, rotations: [rot("A", ["a", "b", "c", "a"]), rot("B", ["b"])] }).status).toBe("unavailable");
  });
  it("lists every problem, not just the first", () => {
    const r = replay(power, crops, { supplyMm: -5, rotations: [rot("A", ["nope"]), rot("B", ["also-nope"])] });
    expect(r.status === "unavailable" && r.problems.length).toBe(3);
  });
  it("power error / no coverage / no days / null elevation -> unavailable with reason and next step", () => {
    const err = replay(makePower({ status: "error" }), crops, { supplyMm: 100, rotations: rots });
    expect(err).toMatchObject({ status: "unavailable", cause: "power-data" });
    const nc = replay(makePower({ status: "no-coverage" }), crops, { supplyMm: 100, rotations: rots });
    expect(nc.status === "unavailable" && nc.nextStep).toMatch(/Pick a location/);
    const noElev = replay(makePower({ elevationM: null }), crops, { supplyMm: 100, rotations: rots });
    expect(noElev.status === "unavailable" && noElev.reason).toMatch(/no elevation/);
    const empty = { ...makePower({ start: "2000-01-01", end: "2000-01-02" }), days: [] };
    expect(replay(empty, crops, { supplyMm: 100, rotations: rots }).status).toBe("unavailable");
  });
  it("labels saved data as a saved response with its date", () => {
    expect(ok(replay(power, crops, { supplyMm: 100, rotations: rots })).dataLabel).toMatch(/^Saved response from 3 Feb 2026/);
  });
});

describe("overlap warning", () => {
  it("detects a long summer crop followed by an autumn-planted winter crop and says by how many days", () => {
    const longSummer = fixtureCrop({ id: "ls", name: "Long summer crop", days: [40, 40, 80, 40], plant: "05-01" }); // 200 days, ends 16 Nov
    const winter = fixtureCrop({ id: "wi", name: "Winter crop", days: [20, 40, 80, 40], plant: "10-15", spans: true }); // 180 days, ends in Y+1
    const r = ok(replay(power, [longSummer, winter, A], { supplyMm: 300, rotations: [rot("overlap", ["ls", "wi"]), rot("none", ["a"])] }));
    const o = r.rotations[0];
    expect(o.overlaps.length).toBeGreaterThan(0);
    const first = o.overlaps[0];
    expect(first.fromCropId).toBe("ls");
    expect(first.toCropId).toBe("wi");
    expect(first.overlapDays).toBe(33); // 15 Oct - 16 Nov
    expect(o.warnings.join(" ")).toMatch(/Long summer crop followed by Winter crop/);
    expect(o.warnings.join(" ")).toMatch(/overlap in dates by 33 days/);
    expect(o.warnings.join(" ")).toMatch(/does not move any dates/);
    expect(r.rotations[1].overlaps).toHaveLength(0);
    expect(r.rotations[1].warnings).toHaveLength(0);
    // the second ordering winter -> long summer: winter (planted Oct Y-1, ends Y) vs summer starting 1 May Y
    const rev = ok(replay(power, [longSummer, winter, A], { supplyMm: 300, rotations: [rot("rev", ["wi", "ls"]), rot("none", ["a"])] }));
    for (const ov of rev.rotations[0].overlaps) expect(ov.overlapDays).toBeGreaterThan(0);
  });

  it("a same-crop repeat whose season is 365 days planted 1 January does not overlap itself", () => {
    const year = fixtureCrop({ id: "yr", days: [100, 100, 100, 65], plant: "01-01" });
    const r = ok(replay(power, [year, A], { supplyMm: 300, rotations: [rot("y", ["yr"]), rot("a", ["a"])] }));
    expect(r.rotations[0].overlaps).toHaveLength(0);
  });

  it("surfaces a disagreement between the catalog's new-year flag and the dates", () => {
    const wrongFlag = fixtureCrop({ id: "wf", name: "Flagged wrong", days: [30, 60, 80, 40], plant: "10-20", spans: false });
    const r = ok(replay(power, [wrongFlag, A], { supplyMm: 300, rotations: [rot("w", ["wf"]), rot("a", ["a"])] }));
    expect(r.rotations[0].warnings.join(" ")).toMatch(/Flagged wrong: the crop catalog says the season does not cross 31 December/);
  });
});

describe("grey seasons in a rotation", () => {
  it("a winter crop's 1986 season is grey when the record starts in January 1986; counts and wording say so", () => {
    const winter = fixtureCrop({ id: "w", name: "Winter crop", kc: [0.5, 1, 0.5], days: [30, 60, 80, 40], plant: "10-20", spans: true });
    const p = makePower({ start: "1986-01-01" });
    const r = ok(replay(p, [winter, A], { supplyMm: 300, rotations: [rot("w", ["w"]), rot("a", ["a"])] }));
    const w = r.rotations[0];
    expect(w.seasons[0].status).toBe("insufficient-data");
    expect(w.seasons[0].outcome).toBeNull();
    expect(w.decades[0].insufficient).toBe(1);
    expect(w.decades[0].evaluable).toBe(9);
    expect(w.headline).toMatch(/of the 9 seasons that could be judged in 1986–1995/);
    expect(w.sentence).toContain("In 1986–1995, 1 of 10 seasons could not be judged");
    expect(r.notes.join(" ")).toMatch(/1 crop-season across/);
    expect(w.totals.evaluable).toBe(39);
  });
});
