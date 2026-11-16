import { describe, expect, it } from "vitest";
import { compareRotations, competitionRanks } from "./compare";
import { explainRotation } from "./explain";
import { judgmentPoints, supplySensitivity } from "./judgment";
import { LOCAL_EXPERTISE_NOTE } from "./note";
import type { ReplayResult } from "../replay/types";
import { fakeReplay, needsByDecade, type FixtureRotation } from "./fixtures";
import type { Comparison, PriorityId } from "./types";

// Hand-computed fixture (values from data/rotation-traits/traits.json, FAO-56 Table 22 and ITIS):
//   wheat  Poaceae  N-fixing no   Zr max 1.8   maize Poaceae N-fixing no  Zr max 1.7
//   cotton Malvaceae N-fixing no  Zr max 1.7   rice  Poaceae N-fixing UNKNOWN Zr max 1.0
const A: FixtureRotation = { name: "A wheat-maize", sequence: ["winter-wheat", "maize-grain"], needs: needsByDecade([3, 3, 3, 2]) };
const B: FixtureRotation = { name: "B maize-cotton", sequence: ["maize-grain", "cotton"], needs: needsByDecade([9, 9, 9, 8]) };
const C: FixtureRotation = { name: "C rice-wheat-maize", sequence: ["rice", "winter-wheat", "maize-grain"], needs: needsByDecade([6, 6, 6, 6]) };
const D: FixtureRotation = { name: "D cotton-wheat", sequence: ["cotton", "winter-wheat"], needs: needsByDecade([2, 2, 2, 2]) };
const ALL = [A, B, C, D];
const SUPPLY = 700;
const replay = fakeReplay(SUPPLY, ALL);
const specs = ALL.map(({ name, sequence }) => ({ name, sequence }));
const run = (selected: PriorityId[], excludedCropIds: string[] = []): Comparison =>
  compareRotations({ rotations: specs, replay, priorities: { selected }, constraints: { supplyMm: SUPPLY, excludedCropIds } });
const fact = (c: Comparison, rot: string, id: string) => c.rotations.find((r) => r.name === rot)!.facts.find((f) => f.id === id)!;
const rank = (c: Comparison, factId: string, rot: string) => c.factRankings.find((f) => f.factId === factId)!.entries.find((e) => e.rotation === rot)!;
const pos = (c: Comparison, p: PriorityId, rot: string) => c.criterionRankings.find((x) => x.priority === p)!.entries.find((e) => e.rotation === rot)!;

describe("competitionRanks", () => {
  it("shows ties as ties and skips the next rank", () => {
    expect(competitionRanks([2, 2, 5], "lower")).toEqual([1, 1, 3]);
    expect(competitionRanks([2, 5, 5, 9], "higher")).toEqual([4, 2, 2, 1]);
  });
  it("leaves null values unranked and does not count them", () => {
    expect(competitionRanks([null, 1, 2], "lower")).toEqual([null, 1, 2]);
  });
  it("treats floating-point near-equal values as a tie", () => {
    expect(competitionRanks([0.1 + 0.2, 0.3], "lower")).toEqual([1, 1]);
  });
});

describe("facts (hand-computed)", () => {
  const c = run(["water", "soil", "forage"]);
  it("water: short counts of last decade from the replay", () => {
    expect(fact(c, A.name, "water-short").value).toBeCloseTo(2 / 10, 12);
    expect(fact(c, A.name, "water-short").display).toBe("Short in 2 of 10 judged seasons in 2016–2025, fewer than 3 of 10 in 1986–1995.");
    expect(fact(c, B.name, "water-short").display).toContain("8 of 10");
    expect(fact(c, A.name, "water-short").fromReplay).toBe(true);
  });
  it("nitrogen-fixing share: 0 of 2 for wheat-maize; unknown (not 0) when rice is in the cycle", () => {
    expect(fact(c, A.name, "n-fixing-share").value).toBe(0);
    expect(fact(c, A.name, "n-fixing-share").display).toBe("0 of 2 years in the cycle are nitrogen-fixing crops");
    const f = fact(c, C.name, "n-fixing-share");
    expect(f.value).toBeNull();
    expect(f.missingCropIds).toEqual(["rice"]);
    expect(f.display).toMatch(/At least 0 of 3 years/);
    expect(f.display).toMatch(/1 year in the cycle is Rice \(paddy\), which has no sourced value for this/);
  });
  it("root depth: mean of upper ends 1.8 and 1.7 = 1.75; deepest is wheat", () => {
    expect(fact(c, A.name, "root-depth").value).toBeCloseTo(1.75, 12);
    expect(fact(c, A.name, "root-depth").display).toContain("Deepest-rooted crop: Winter wheat at 1.8 m");
    expect(fact(c, C.name, "root-depth").value).toBeCloseTo((1.0 + 1.8 + 1.7) / 3, 12);
  });
  it("family diversity and back-to-back same family (cyclic)", () => {
    expect(fact(c, A.name, "family-diversity").value).toBe(1);
    expect(fact(c, A.name, "family-diversity").display).toContain("Back-to-back crops in the same family: Winter wheat then Maize (grain corn) (Poaceae)");
    expect(fact(c, B.name, "family-diversity").value).toBe(2);
    expect(fact(c, B.name, "family-diversity").display).toContain("No back-to-back crops share a family");
    // rice, wheat, maize all Poaceae: three adjacent pairs around the cycle, including maize -> rice.
    expect(fact(c, C.name, "family-diversity").display.match(/ then /g)!.length).toBe(3);
  });
  it("forage is unknown (not no) when a crop has no sourced statement", () => {
    expect(fact(c, A.name, "forage-share").value).toBeNull(); // wheat has no sourced forage value
    expect(fact(c, A.name, "forage-share").display).toMatch(/At least 1 of 2 years/); // maize silage is sourced
  });
  it("rice p is not compared and is said so; the mean uses the comparable crops only", () => {
    const d = fact(c, C.name, "drought-proxy");
    expect(d.value).toBeCloseTo(0.55, 12); // wheat 0.55, maize 0.55
    expect(d.display).toContain("not comparable");
    expect(d.better).toBeNull();
  });
});

describe("rankings (hand-computed)", () => {
  const c = run(["water", "soil"]);
  it("water: fewer last-decade short ranks first, tie shown", () => {
    // last decade short: A 2, B 8, C 6, D 2 (of 10)
    expect(rank(c, "water-short", A.name).rank).toBe(1);
    expect(rank(c, "water-short", D.name).rank).toBe(1);
    expect(rank(c, "water-short", A.name).tiedWith).toEqual([D.name]);
    expect(rank(c, "water-short", C.name).rank).toBe(3);
    expect(rank(c, "water-short", B.name).rank).toBe(4);
  });
  it("soil fact ranks: n-fixing all tie among those with values; rice rotation unranked on it", () => {
    for (const r of [A, B, D]) expect(rank(c, "n-fixing-share", r.name).rank).toBe(1);
    expect(rank(c, "n-fixing-share", C.name).rank).toBeNull();
    // family: A 1, B 2, C 1, D 2 distinct -> B,D first (1), A,C third (3)
    expect(rank(c, "family-diversity", B.name).rank).toBe(1);
    expect(rank(c, "family-diversity", D.name).rank).toBe(1);
    expect(rank(c, "family-diversity", A.name).rank).toBe(3);
    expect(rank(c, "family-diversity", C.name).rank).toBe(3);
    // root: A 1.75, D 1.75, B 1.7, C 1.5
    expect(rank(c, "root-depth", A.name).rank).toBe(1);
    expect(rank(c, "root-depth", D.name).rank).toBe(1);
    expect(rank(c, "root-depth", B.name).rank).toBe(3);
    expect(rank(c, "root-depth", C.name).rank).toBe(4);
  });
  it("soil position = unweighted mean of the fact ranks that exist", () => {
    // A (1+3+1)/3, B (1+1+3)/3, D (1+1+1)/3 = 1, C (3+4)/2 = 3.5 on 2 of 3 facts
    expect(pos(c, "soil", D.name).meanRank).toBeCloseTo(1, 12);
    expect(pos(c, "soil", A.name).meanRank).toBeCloseTo(5 / 3, 12);
    expect(pos(c, "soil", B.name).meanRank).toBeCloseTo(5 / 3, 12);
    expect(pos(c, "soil", C.name)).toMatchObject({ meanRank: 3.5, basedOn: 2, of: 3 });
    expect(pos(c, "soil", D.name).position).toBe(1);
    expect(pos(c, "soil", A.name).position).toBe(2);
    expect(pos(c, "soil", B.name).position).toBe(2);
    expect(pos(c, "soil", B.name).tiedWith).toEqual([A.name]);
    expect(pos(c, "soil", C.name).position).toBe(4);
  });
  it("balanced view (2+ criteria): unweighted mean of positions, hand-computed", () => {
    // water positions A1 B4 C3 D1; soil positions A2 B2 C4 D1 -> means A1.5 B3 C3.5 D1
    const b = c.balanced!;
    const e = (n: string) => b.entries.find((x) => x.rotation === n)!;
    expect(e(A.name).meanPosition).toBe(1.5);
    expect(e(B.name).meanPosition).toBe(3);
    expect(e(C.name).meanPosition).toBe(3.5);
    expect(e(D.name).meanPosition).toBe(1);
    expect(e(D.name).position).toBe(1);
    expect(e(A.name).position).toBe(2);
    expect(e(B.name).position).toBe(3);
    expect(e(C.name).position).toBe(4);
    expect(b.label).toMatch(/unweighted/i);
    expect(b.rule).toMatch(/no hidden weights/);
  });
  it("a selected criterion with nothing to rank (forage here) is dropped from the balanced view and named", () => {
    const f = run(["water", "soil", "forage"]);
    expect(f.balanced!.droppedCriteria).toEqual(["forage"]);
    expect(f.balanced!.entries.find((x) => x.rotation === D.name)!.meanPosition).toBe(1);
    expect(f.balanced!.entries.find((x) => x.rotation === C.name)!.meanPosition).toBe(3.5);
    expect(explainRotation(f, A.name).join(" ")).toMatch(/Balanced view \(without Forage, which has nothing to rank\): place 2 of 4/);
  });
  it("two criteria selected but only one can be ranked: no balanced view, with a warning", () => {
    const f = run(["water", "forage"]);
    expect(f.balanced).toBeNull();
    expect(f.warnings.join(" ")).toMatch(/No balanced view/);
  });
  it("one criterion selected: no balanced view, and only that criterion is ranked", () => {
    const one = run(["water"]);
    expect(one.balanced).toBeNull();
    expect(one.criterionRankings.map((x) => x.priority)).toEqual(["water"]);
    expect(one.factRankings.map((x) => x.factId)).toEqual(["water-short"]);
  });
  it("a criterion that is not selected is never ranked", () => {
    const soilOnly = run(["soil"]);
    expect(soilOnly.factRankings.some((f) => f.factId === "water-short")).toBe(false);
  });
  it("has no numeric score anywhere in the output", () => {
    const text = JSON.stringify(c);
    expect(text).not.toMatch(/"score"|0-100/i);
  });
});

describe("income priority", () => {
  it("is shown as not ranked, with the not-connected reason, and does not enter the ranking or the balanced view", () => {
    const c = run(["income", "water"]);
    expect(c.notRanked).toHaveLength(1);
    expect(c.notRanked[0].priority).toBe("income");
    expect(c.notRanked[0].reason).toMatch(/API keys/);
    expect(c.criterionRankings.map((x) => x.priority)).toEqual(["water"]);
    expect(c.balanced).toBeNull(); // only one rankable criterion left
    expect(c.marketData.status).toBe("not-connected");
  });
});

describe("exclusion constraints", () => {
  it("a rotation with an excluded crop is not ranked and does not take a place from others", () => {
    const c = run(["water"], ["cotton"]);
    const wB = rank(c, "water-short", B.name);
    const wD = rank(c, "water-short", D.name);
    expect(wB.rank).toBeNull();
    expect(wD.rank).toBeNull();
    // remaining A 2, C 6 -> A first, C second (D, which tied for first, is gone)
    expect(rank(c, "water-short", A.name).rank).toBe(1);
    expect(rank(c, "water-short", C.name).rank).toBe(2);
    expect(c.rotations.find((r) => r.name === B.name)!.excludedBecause).toEqual(["cotton"]);
    expect(c.warnings.join(" ")).toMatch(/2 rotations left out/);
    expect(explainRotation(c, B.name).join(" ")).toMatch(/Left out of every ranking because it includes cotton/);
  });
});

describe("replay problems", () => {
  it("a crop outside the catalog (alfalfa) gives no water result and is never ranked on water", () => {
    const rot = { name: "Alfalfa-wheat", sequence: ["alfalfa", "winter-wheat"] };
    const c = compareRotations({
      rotations: [rot, { name: A.name, sequence: A.sequence }],
      replay: fakeReplay(SUPPLY, [{ ...rot, needs: needsByDecade([0, 0, 0, 0]) }, A]),
      priorities: { selected: ["water"] },
      constraints: { supplyMm: SUPPLY },
    });
    const f = fact(c, "Alfalfa-wheat", "water-short");
    expect(f.value).toBeNull();
    expect(f.display).toMatch(/not in the crop catalog/);
    expect(rank(c, "water-short", "Alfalfa-wheat").rank).toBeNull();
    expect(rank(c, "water-short", A.name).rank).toBe(1);
  });
  it("an unavailable replay leaves water unranked with the reason", () => {
    const c = compareRotations({
      rotations: specs,
      replay: { status: "unavailable", cause: "power-data", reason: "no climate record", problems: [], nextStep: "x" },
      priorities: { selected: ["water"] },
      constraints: { supplyMm: SUPPLY },
    });
    expect(c.factRankings[0].entries.every((e) => e.rank === null)).toBe(true);
    expect(fact(c, A.name, "water-short").display).toContain("no climate record");
  });
  it("warns when the replay supply differs from the chosen supply", () => {
    const c = compareRotations({ rotations: specs, replay, priorities: { selected: ["water"] }, constraints: { supplyMm: 650 } });
    expect(c.warnings.join(" ")).toMatch(/run at 700 mm but the chosen supply is 650 mm/);
  });
});

describe("supply sensitivity (re-run at 90 and 110 percent)", () => {
  // 3 seasons at 650 mm need (ok at 700, red at 630); 2 seasons at 750 (red at 700, green at 770); 20 at 100; 15 at 1000.
  const needs = [...Array(3).fill(650), ...Array(2).fill(750), ...Array(20).fill(100), ...Array(15).fill(1000)];
  const X: FixtureRotation = { name: "X", sequence: ["winter-wheat", "maize-grain"], needs };
  const Y: FixtureRotation = { name: "Y", sequence: ["maize-grain", "cotton"], needs: needsByDecade([5, 5, 5, 5]) };
  const rerun = (mm: number) => fakeReplay(mm, [X, Y]);
  it("counts the seasons whose red/green result changes, by hand", () => {
    const s = supplySensitivity(rerun(700), rerun);
    expect(s.available).toBe(true);
    if (!s.available) return;
    const x = s.checks.find((c) => c.rotation === "X")!;
    expect(x.lowSupplyMm).toBeCloseTo(630, 9);
    expect(x.highSupplyMm).toBeCloseTo(770, 9);
    expect(x.turnRedAtLow).toBe(3);
    expect(x.turnGreenAtHigh).toBe(2);
    expect(x.anyChange).toBe(true);
    expect(x.seasonsCompared).toBe(40);
    const y = s.checks.find((c) => c.rotation === "Y")!;
    expect(y.anyChange).toBe(false);
  });
  it("is unavailable at 0 mm supply and when the replay is unavailable", () => {
    expect(supplySensitivity(rerun(0), rerun).available).toBe(false);
    const bad: ReplayResult = { status: "unavailable", cause: "power-data", reason: "r", problems: [], nextStep: "n" };
    expect(supplySensitivity(bad, rerun)).toEqual({ available: false, reason: "r" });
  });
  it("judgmentPoints reports the flips and the no-change case in words built from the counts", () => {
    const comparison = compareRotations({ rotations: [{ name: "X", sequence: X.sequence }, { name: "Y", sequence: Y.sequence }], replay: rerun(700), priorities: { selected: ["water"] }, constraints: { supplyMm: 700 } });
    const pts = judgmentPoints({ comparison, replay: rerun(700), rerun, location: { lat: 37.93, lon: -121.66 } });
    const x = pts.find((p) => p.kind === "supply-sensitivity" && p.rotation === "X")!;
    expect(x.text).toContain("3 seasons that are green at 700 mm turn red");
    expect(x.text).toContain("2 seasons that are red turn green");
    const y = pts.find((p) => p.kind === "supply-sensitivity" && p.rotation === "Y")!;
    expect(y.text).toMatch(/no red or green result changes/);
    expect(pts.some((p) => p.kind === "outside-california")).toBe(false); // Brentwood is in California
  });
});

describe("judgment points", () => {
  const comparison = run(["soil", "forage", "income"]);
  const pts = judgmentPoints({ comparison, replay, location: { lat: 30.9, lon: 75.85 } });
  it("lists unknown traits by crop and trait", () => {
    const u = pts.find((p) => p.kind === "unknown-traits" && p.rotation === C.name)!;
    expect(u.text).toContain("Rice (paddy): nitrogen fixing");
  });
  it("flags a pin outside California and names cotton", () => {
    const o = pts.find((p) => p.kind === "outside-california" && p.rotation === B.name)!;
    expect(o.text).toMatch(/outside California/);
    expect(o.text).toMatch(/cotton in particular/);
  });
  it("says the supply check and the location check were not done when their inputs are missing", () => {
    expect(pts.some((p) => p.kind === "supply-sensitivity" && /not done/.test(p.text))).toBe(true);
    const noLoc = judgmentPoints({ comparison, replay });
    expect(noLoc.some((p) => /No pin location/.test(p.text))).toBe(true);
  });
  it("mentions income not connected and the rice p", () => {
    expect(pts.some((p) => p.kind === "income-not-connected")).toBe(true);
    expect(pts.some((p) => p.kind === "rice-p" && p.rotation === C.name)).toBe(true);
  });
  it("lists ties", () => {
    const t = judgmentPoints({ comparison: run(["water"]), replay }).filter((p) => p.kind === "ties");
    expect(t.map((p) => p.rotation).sort()).toEqual([A.name, D.name]);
  });
});

describe("wording has no NaN, undefined, null or object leaks", () => {
  it("explanations and judgment points across several selections", () => {
    const bad = /NaN|undefined|null|\[object|Infinity/;
    for (const sel of [["water"], ["soil"], ["forage"], ["water", "soil", "forage", "income"], []] as PriorityId[][]) {
      const c = run(sel, sel.length === 4 ? ["cotton"] : []);
      const lines = [
        ...c.rotations.flatMap((r) => explainRotation(c, r.name)),
        ...judgmentPoints({ comparison: c, replay, location: { lat: 37.9, lon: -121.7 } }).map((p) => p.text),
        ...c.factRankings.map((f) => f.rule),
        ...c.criterionRankings.map((x) => x.rule),
        ...(c.balanced ? [c.balanced.rule] : []),
        ...c.warnings,
      ];
      for (const l of lines) expect(l, l).not.toMatch(bad);
    }
  });
  it("the standing note carries the required areas", () => {
    expect(LOCAL_EXPERTISE_NOTE.text).toMatch(/does not replace/);
    const areas = LOCAL_EXPERTISE_NOTE.judgmentAreas.join(" ").toLowerCase();
    for (const w of ["soil tests", "pests", "equipment", "labour", "markets", "water rights"]) expect(areas).toContain(w);
  });
  it("explanations of a ranked rotation state place and ties from the numbers", () => {
    const c = run(["water", "soil"]);
    const lines = explainRotation(c, A.name).join("\n");
    expect(lines).toContain("Conserve water: place 1 of 4 ranked rotations, tied with D cotton-wheat.");
    expect(lines).toMatch(/Balanced view: place 2 of 4/);
  });
});
