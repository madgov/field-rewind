/** Test-only helpers: tiny hand-made replay results. Not data for the app. */
import type { ReplayOk, RotationResult, SeasonResult } from "../replay/types";

export type FixtureRotation = { name: string; sequence: string[]; needs: number[] };

/** 40 season needs (mm) -> a ReplayOk at the given supply. Outcome is need > supply => short. Only the fields the engine reads are filled. */
export function fakeReplay(supplyMm: number, rots: FixtureRotation[]): ReplayOk {
  const rotations = rots.map((r) => {
    const seasons = r.needs.map((need, i) => ({ year: 1986 + i, needMm: need, outcome: need > supplyMm ? "short" : "ok" }) as unknown as SeasonResult);
    const decades = [0, 1, 2, 3].map((d) => {
      const part = seasons.slice(d * 10, d * 10 + 10);
      const short = part.filter((s) => s.outcome === "short").length;
      return { label: `${1986 + d * 10}–${1995 + d * 10}`, startYear: 1986 + d * 10, endYear: 1995 + d * 10, seasons: 10, short, ok: 10 - short, insufficient: 0, evaluable: 10 };
    });
    return { name: r.name, sequence: r.sequence, cropNames: r.sequence, seasons, decades } as unknown as RotationResult;
  });
  return { status: "ok", supplyMm, rotations, notes: [], dataLabel: "fixture" };
}

/** Needs for 40 seasons: `shorts` = [first, second, third, last decade] seasons above supply (1000 mm) and the rest at 100 mm. */
export function needsByDecade(shorts: [number, number, number, number]): number[] {
  const out: number[] = [];
  for (const s of shorts) for (let i = 0; i < 10; i++) out.push(i < s ? 1000 : 100);
  return out;
}
