/**
 * Replay screen state <-> URL query. Compact and validated on read: anything unreadable falls back to the constructed
 * example with a note the page shows, never a crash.
 *
 *   r1=winter-wheat,maize-grain   crop ids of rotation 1, in order (1 to 3)
 *   n1=Wheat%2C%20then%20maize    rotation 1 name (optional)
 *   r2, n2, r3, n3                the same for rotations 2 and 3 (2 or 3 rotations in total)
 *   s=700                         seasonal water supply, mm
 *   y=2012                        selected season year
 * lat and lon are owned by the page and left alone.
 */
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "@/lib/replay/examples";
import { FIRST_SEASON, LAST_SEASON } from "@/lib/replay/types";

export type RotationDraft = { name: string; sequence: string[] };
export type ReplayState = { rotations: RotationDraft[]; supplyMm: number; year: number };

export const MAX_NAME_LENGTH = 40;
export const DEFAULT_YEAR = LAST_SEASON;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
export type ParseContext = { validCropIds: ReadonlySet<string>; supplyMaxMm: number };
export type ParseResult = { state: ReplayState; notes: string[]; fromLink: boolean };

export function exampleRotations(): RotationDraft[] {
  return EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence: [...sequence] }));
}

export function exampleState(year = DEFAULT_YEAR): ReplayState {
  return { rotations: exampleRotations(), supplyMm: EXAMPLE_SUPPLY_MM, year };
}

/** True while the rotations are exactly the constructed examples (names and crops), i.e. the user has not edited them. */
export function rotationsAreExample(rotations: RotationDraft[]): boolean {
  if (rotations.length !== EXAMPLE_ROTATIONS.length) return false;
  return rotations.every((r, i) => {
    const e = EXAMPLE_ROTATIONS[i];
    return r.name === e.name && r.sequence.length === e.sequence.length && r.sequence.every((id, k) => id === e.sequence[k]);
  });
}

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Display name used when the name box is empty, and what is sent to the engine. */
export function nameOrDefault(name: string, index: number): string {
  const t = name.trim().slice(0, MAX_NAME_LENGTH);
  return t === "" ? `Rotation ${index + 1}` : t;
}

export function parseState(params: Params, ctx: ParseContext): ParseResult {
  const notes: string[] = [];
  const base = exampleState();

  // Year
  let year = base.year;
  const yRaw = get(params, "y");
  if (yRaw !== undefined) {
    const y = Number(yRaw);
    if (Number.isInteger(y) && y >= FIRST_SEASON && y <= LAST_SEASON) year = y;
    else notes.push(`The year in the link ("${yRaw.slice(0, 12)}") is not a season from ${FIRST_SEASON} to ${LAST_SEASON}, so ${DEFAULT_YEAR} is selected.`);
  }

  // Supply
  let supplyMm = base.supplyMm;
  const sRaw = get(params, "s");
  if (sRaw !== undefined) {
    const s = sRaw.trim() === "" ? NaN : Number(sRaw);
    if (Number.isFinite(s) && s >= 0 && s <= ctx.supplyMaxMm) supplyMm = Math.round(s);
    else notes.push(`The water supply in the link ("${sRaw.slice(0, 12)}") is not a number from 0 to ${ctx.supplyMaxMm.toLocaleString("en-US")} mm, so the example supply of ${EXAMPLE_SUPPLY_MM} mm is used.`);
  }

  // Rotations
  const present: number[] = [];
  for (let i = 1; i <= 3; i++) if (get(params, `r${i}`) !== undefined) present.push(i);
  if (present.length === 0) return { state: { rotations: base.rotations, supplyMm, year }, notes, fromLink: sRaw !== undefined || yRaw !== undefined };

  const rotations: RotationDraft[] = [];
  let problem: string | null = null;
  for (const i of present) {
    const ids = (get(params, `r${i}`) ?? "").split(",").map((x) => x.trim());
    if (ids.length < 1 || ids.length > 3 || ids.some((id) => id === "")) {
      problem = `Rotation ${i} in the link needs 1 to 3 crops.`;
      break;
    }
    const unknown = ids.find((id) => !ctx.validCropIds.has(id));
    if (unknown !== undefined) {
      problem = `Rotation ${i} in the link names a crop ("${unknown.slice(0, 30)}") that is not one of the usable crops.`;
      break;
    }
    const nm = (get(params, `n${i}`) ?? "").trim().slice(0, MAX_NAME_LENGTH);
    rotations.push({ name: nm === "" ? `Rotation ${rotations.length + 1}` : nm, sequence: ids });
  }
  if (!problem && rotations.length < 2) problem = "The link has fewer than 2 rotations.";
  if (problem) {
    notes.push(`${problem} The constructed example is shown instead.`);
    return { state: { rotations: base.rotations, supplyMm, year }, notes, fromLink: true };
  }
  return { state: { rotations, supplyMm, year }, notes, fromLink: true };
}

/** Query string for the state (no lat/lon, no leading "?"). */
export function encodeState(state: ReplayState): string {
  const p = new URLSearchParams();
  state.rotations.forEach((r, i) => {
    p.set(`r${i + 1}`, r.sequence.join(","));
    const nm = r.name.trim().slice(0, MAX_NAME_LENGTH);
    if (nm !== "") p.set(`n${i + 1}`, nm);
  });
  p.set("s", String(Math.round(state.supplyMm)));
  p.set("y", String(state.year));
  return p.toString();
}
