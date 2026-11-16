/**
 * Optional AI reading of the farmer's words. Gemini only lists the raw mentions it heard (crop words, numbers with the unit as said,
 * priorities). It does no arithmetic: crop matching and every unit conversion run in parse.ts. Any failure or malformed reply falls
 * back to the rule-based reader, and the result says so.
 */
import type { PriorityId } from "../farmer/priorities";
import type { ModelCaller } from "../advisor/model";
import { fromMentions, parseFarmerText, PRIORITY_IDS, SUPPLY_UNITS, type Mentions, type SupplyUnit } from "./parse";
import type { Understood } from "./types";

export const MAX_TEXT_CHARS = 2000;

export const UNDERSTAND_SYSTEM_PROMPT = `You read what a farmer said and list ONLY what they actually mentioned, as JSON matching the schema.
Rules, all strict:
1. Never calculate, convert or estimate. Copy each number as the farmer said it, written as digits (for "30 thousand" write 30000, for "2 and a half" write 2.5). Pick the unit that matches the words they used.
2. Leave out anything not said. Do not guess a crop, number or priority.
3. rotations: each option the farmer is weighing, crops in the order they said them, as their own words (for example "wheat", "corn"). Words like "then", "followed by", "after" stay in one option; "or", "versus", "compared with" start a new option. At most 3 options.
4. supply is the water they can put on per season. budget is the money they can spend on water; waterPrice is the price of water per acre-foot or per megalitre. Never put the water price in budget.
5. area is the field size.
6. priorities: only those they expressed, in the order said: dependable-water (not running short), use-less-water, low-water-cost (water bill), protect-soil-nutrients (soil, nutrients, sustainability), grow-more-crops (variety).`;

const NUMBER = { type: "number" };
export const UNDERSTAND_SCHEMA = {
  type: "object",
  properties: {
    rotations: { type: "array", items: { type: "object", properties: { crops: { type: "array", items: { type: "string" } } }, required: ["crops"] } },
    supply: { type: "object", properties: { value: NUMBER, unit: { type: "string", enum: [...SUPPLY_UNITS] } }, required: ["value", "unit"] },
    budget: { type: "object", properties: { amount: NUMBER, per: { type: "string", enum: ["acre", "total", "unknown"] } }, required: ["amount", "per"] },
    waterPrice: { type: "object", properties: { amount: NUMBER, per: { type: "string", enum: ["acre-foot", "megalitre"] } }, required: ["amount", "per"] },
    area: { type: "object", properties: { value: NUMBER, unit: { type: "string", enum: ["acre", "hectare"] } }, required: ["value", "unit"] },
    priorities: { type: "array", items: { type: "string", enum: [...PRIORITY_IDS] } },
  },
  required: ["rotations", "priorities"],
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const posNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Strict check of the model's reply. Returns null on anything unexpected. */
export function validateModelMentions(raw: unknown): Mentions | null {
  if (!isObj(raw)) return null;
  const allowed = new Set(["rotations", "supply", "budget", "waterPrice", "area", "priorities"]);
  if (Object.keys(raw).some((k) => !allowed.has(k))) return null;
  if (!Array.isArray(raw.rotations) || raw.rotations.length > 3) return null;
  const rotations: string[][] = [];
  for (const r of raw.rotations) {
    if (!isObj(r) || !Array.isArray(r.crops) || r.crops.length > 12) return null;
    if (!r.crops.every((c) => typeof c === "string" && c.trim().length > 0 && c.length <= 60)) return null;
    rotations.push(r.crops as string[]);
  }
  const opt = <T>(v: unknown, check: (o: Obj) => T | null): T | null | undefined => (v === undefined || v === null ? null : isObj(v) ? (check(v) ?? undefined) : undefined);
  const supply = opt(raw.supply, (o) => (posNum(o.value) && oneOf(o.unit, SUPPLY_UNITS) ? { value: o.value, unit: o.unit as SupplyUnit } : null));
  const budget = opt(raw.budget, (o) => (posNum(o.amount) && oneOf(o.per, ["acre", "total", "unknown"] as const) ? { amount: o.amount, per: o.per } : null));
  const waterPrice = opt(raw.waterPrice, (o) => (posNum(o.amount) && oneOf(o.per, ["acre-foot", "megalitre"] as const) ? { amount: o.amount, per: o.per } : null));
  const area = opt(raw.area, (o) => (posNum(o.value) && oneOf(o.unit, ["acre", "hectare"] as const) ? { value: o.value, unit: o.unit } : null));
  if (supply === undefined || budget === undefined || waterPrice === undefined || area === undefined) return null;
  if (!Array.isArray(raw.priorities) || !raw.priorities.every((p) => oneOf(p, PRIORITY_IDS))) return null;
  return { rotations, supply, budget, waterPrice, area, priorities: raw.priorities as PriorityId[] };
}

export type UnderstandOutcome =
  | { method: "ai"; model: string; understood: Understood }
  | { method: "rules"; understood: Understood; /** Why the model was not used, in plain words. */ reason: string };

export async function understandWithModel(text: string, call: ModelCaller, modelName = "Gemini"): Promise<UnderstandOutcome> {
  const words = text.slice(0, MAX_TEXT_CHARS);
  try {
    const res = await call({ system: UNDERSTAND_SYSTEM_PROMPT, user: `What the farmer said:\n"""${words}"""`, schema: UNDERSTAND_SCHEMA });
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      return { method: "rules", understood: parseFarmerText(words), reason: "The AI reply was not valid JSON." };
    }
    const m = validateModelMentions(parsed);
    if (!m) return { method: "rules", understood: parseFarmerText(words), reason: "The AI reply did not match the expected shape." };
    return { method: "ai", model: res.model ?? modelName, understood: fromMentions(m) };
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : "Gemini could not be reached.";
    return { method: "rules", understood: parseFarmerText(words), reason: msg };
  }
}
