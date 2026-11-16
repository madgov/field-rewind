/**
 * Rule-based reading of a farmer's own words into choices for the plan. Pure and deterministic: no network, no AI.
 * The same small helpers (crop words to catalog ids, unit conversions, budget-derived supply) are used by understand.ts
 * when Gemini extracts the raw mentions, so every number is always converted here, in code.
 */
import { getCrop, isCropUsable, usableCrops } from "../crops/catalog";
import { budgetToSupplyMm, HECTARES_PER_ACRE, MM_PER_FOOT } from "../farmer/budget";
import type { PriorityId } from "../farmer/priorities";
import { validateSupply } from "../replay/evaluate";
import type { Understood } from "./types";

/** mm per inch (exact by definition). */
export const MM_PER_INCH = 25.4;
/** 1 ML over 1 hectare = 1000 m3 / 10,000 m2 = 0.1 m = 100 mm. */
export const MM_PER_ML_PER_HECTARE = 100;
/** Acres per hectare, rounded as stated in docs/assistant.md (1 / 0.40468564224 = 2.471054...). */
export const ACRES_PER_HECTARE = 2.47105;

export const MAX_ROTATIONS = 3;
export const MAX_CROPS_PER_ROTATION = 6;

export type SupplyUnit = "mm" | "inch" | "foot" | "acre-foot-per-acre" | "ml-per-hectare";
export const SUPPLY_UNITS: readonly SupplyUnit[] = ["mm", "inch", "foot", "acre-foot-per-acre", "ml-per-hectare"];
export type AreaUnit = "acre" | "hectare";
export const PRIORITY_IDS: readonly PriorityId[] = ["dependable-water", "use-less-water", "low-water-cost", "protect-soil-nutrients", "grow-more-crops"];

/** Raw mentions, before any conversion. Produced by the rules below or by the model in understand.ts. */
export type Mentions = {
  rotations: string[][];
  supply: { value: number; unit: SupplyUnit; asSaid?: string } | null;
  budget: { amount: number; per: "acre" | "total" | "unknown" } | null;
  waterPrice: { amount: number; per: "acre-foot" | "megalitre" } | null;
  area: { value: number; unit: AreaUnit } | null;
  priorities: PriorityId[];
};

/** Catalog synonyms. Order matters: "sugar beet" before "bean". */
const CROP_SYNONYMS: { re: RegExp; id: string }[] = [
  { re: /\bsugar\s*beets?\b/, id: "sugar-beet" },
  { re: /\b(?:soy\s*beans?|soya?)\b/, id: "soybean" },
  { re: /\b(?:cow\s*peas?|black[\s-]*eyed?\s+(?:peas?|beans?)|blackeyes?)\b/, id: "cowpea" },
  { re: /\b(?:dry\s+)?beans?\b/, id: "dry-bean" },
  { re: /\bspring\s+wheat\b/, id: "spring-wheat" },
  { re: /\bwheat\b/, id: "winter-wheat" },
  { re: /\b(?:sweet\s*corn|sweet\s+maize)\b/, id: "sweet-corn" },
  { re: /\b(?:corn|maize)\b/, id: "maize-grain" },
  { re: /\b(?:sorghum|milo|jowar)\b/, id: "grain-sorghum" },
  { re: /\bbarley\b/, id: "barley" },
  { re: /\boats?\b/, id: "oats" },
  { re: /\b(?:(?:pearl\s+)?millets?|bajra)\b/, id: "millet" },
  { re: /\bsafflower\b/, id: "safflower" },
  { re: /\b(?:lentils?|dal|masoor)\b/, id: "lentil" },
  { re: /\b(?:peanuts?|groundnuts?)\b/, id: "groundnut" },
  { re: /\b(?:potato(?:es)?|spuds?)\b/, id: "potato" },
  { re: /\b(?:(?:processing\s+)?tomato(?:es)?)\b/, id: "processing-tomato" },
  { re: /\bonions?\b/, id: "onion" },
  { re: /\bcarrots?\b/, id: "carrot" },
  { re: /\blettuce\b/, id: "lettuce" },
  { re: /\b(?:water\s*melons?)\b/, id: "watermelon" },
  { re: /\b(?:cantaloupes?|musk\s*melons?)\b/, id: "cantaloupe" },
  { re: /\b(?:honeydews?|melons?)\b/, id: "sweet-melon" },
  { re: /\bcotton\b/, id: "cotton" },
  { re: /\b(?:rice|paddy)\b/, id: "rice" },
  { re: /\bsunflowers?\b/, id: "sunflower" },
];

/** Common crops that are not in the sourced catalog. Heard, shown back, never modelled. */
const OTHER_CROPS =
  /\b(?:alfalfa|almonds?|grapes?|vineyards?|pistachios?|walnuts?|canola|rapeseed|sugar\s*cane|chick\s*peas?|garbanzos?|chana|quinoa|garlic|peppers?|citrus|oranges?|olives?|hay|rye|mustard|peaches|cherries|apples?)\b/;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Maps one crop word to a usable catalog id, or returns it as unmatched (with the catalog name when it is a catalog crop that cannot be modelled). */
export function cropWordToId(word: string): { id: string } | { unmatched: string } {
  const w = word.toLowerCase().trim();
  for (const s of CROP_SYNONYMS) {
    if (s.re.test(w)) {
      const crop = getCrop(s.id);
      if (crop && isCropUsable(crop).usable) return { id: s.id };
      return { unmatched: crop ? crop.name : word.trim() };
    }
  }
  return { unmatched: word.trim() };
}

/** Converts a stated seasonal supply to whole mm. */
export function supplyToMm(value: number, unit: SupplyUnit): number {
  const f = unit === "mm" ? 1 : unit === "inch" ? MM_PER_INCH : unit === "ml-per-hectare" ? MM_PER_ML_PER_HECTARE : MM_PER_FOOT;
  return Math.round(value * f);
}

export function supplyPhrase(value: number, unit: SupplyUnit): string {
  switch (unit) {
    case "mm":
      return `${value} mm`;
    case "inch":
      return `${value} inches`;
    case "foot":
      return `${value} feet of water`;
    case "acre-foot-per-acre":
      return `${value} acre-feet per acre`;
    case "ml-per-hectare":
      return `${value} ML per hectare`;
  }
}

export function areaToAcres(value: number, unit: AreaUnit): number {
  return unit === "hectare" ? round1(value * ACRES_PER_HECTARE) : value;
}

/** Supply from budget, price and acres, using the existing budget arithmetic. null when it cannot be computed. */
export function supplyFromBudget(
  budget: NonNullable<Mentions["budget"]>,
  price: NonNullable<Mentions["waterPrice"]>,
  acres: number,
): { supplyMm: number; asSaid: string } | null {
  const total = budget.per === "acre" ? budget.amount * acres : budget.amount;
  const r =
    price.per === "acre-foot"
      ? budgetToSupplyMm({ units: "us", budget: total, waterPrice: price.amount, area: acres, currencyLabel: "$" })
      : // 1 megalitre = 1000 m3, and acres to hectares with the exact acre definition.
        budgetToSupplyMm({ units: "metric", budget: total, waterPrice: price.amount / 1000, area: acres * HECTARES_PER_ACRE, currencyLabel: "$" });
  if (r.status !== "ok") return null;
  const unit = price.per === "acre-foot" ? "acre-foot" : "megalitre";
  return { supplyMm: Math.round(r.supplyMm), asSaid: `from your budget: $${total} at $${price.amount} per ${unit} over ${acres} acres` };
}

export function cropQuestion(): string {
  return `Which crops do you grow, in order? We can model: ${usableCrops()
    .map((c) => c.name)
    .join(", ")}.`;
}
export const SUPPLY_QUESTION =
  "How much water can you put on per season? For example 600 mm, 24 inches, 2 acre-feet per acre or 6 ML per hectare. Or tell us your water budget, the price per acre-foot and your acres.";

/** Turns raw mentions into the Understood contract. All conversion happens here. */
export function fromMentions(m: Mentions): Understood {
  const unmatched: string[] = [];
  const addUnmatched = (w: string) => {
    if (!unmatched.some((u) => u.toLowerCase() === w.toLowerCase())) unmatched.push(w);
  };
  const rotations: Understood["rotations"] = [];
  for (const words of m.rotations) {
    const seq: string[] = [];
    for (const w of words) {
      const r = cropWordToId(w);
      if ("id" in r) seq.push(r.id);
      else addUnmatched(r.unmatched);
    }
    if (seq.length && rotations.length < MAX_ROTATIONS) rotations.push({ name: `Plan ${rotations.length + 1}`, sequence: seq.slice(0, MAX_CROPS_PER_ROTATION) });
  }

  const acres = m.area ? areaToAcres(m.area.value, m.area.unit) : null;
  const missing: string[] = [];
  if (!rotations.length) missing.push(cropQuestion());

  let supplyMm: number | null = null;
  let supplyAsSaid: string | null = null;
  if (m.supply) {
    const mm = supplyToMm(m.supply.value, m.supply.unit);
    if (validateSupply(mm) === null) {
      supplyMm = mm;
      supplyAsSaid = m.supply.asSaid ?? supplyPhrase(m.supply.value, m.supply.unit);
    }
  } else if (m.budget && m.waterPrice && acres) {
    const b = supplyFromBudget(m.budget, m.waterPrice, acres);
    if (b && validateSupply(b.supplyMm) === null) {
      supplyMm = b.supplyMm;
      supplyAsSaid = b.asSaid;
    }
  }
  if (supplyMm === null) missing.push(SUPPLY_QUESTION);

  const seen = new Set<PriorityId>();
  const priorities = m.priorities.filter((p) => PRIORITY_IDS.includes(p) && !seen.has(p) && (seen.add(p), true));

  return { rotations, supplyMm, supplyAsSaid, budget: m.budget, waterPrice: m.waterPrice, acres, priorities, unmatchedCrops: unmatched, missing };
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;
function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}
/** Replaces a matched span with spaces so later rules do not read it again; positions stay the same. */
function blank(text: string, start: number, len: number): string {
  return text.slice(0, start) + " ".repeat(len) + text.slice(start + len);
}

const PRICE_RE = new RegExp(String.raw`\$\s*${NUM}\s*(?:dollars?\s*)?(?:an?|per|\/|each)\s*(acre[\s-]?f(?:oo|ee)?t|af|megalit(?:re|er)|ml)\b|${NUM}\s*(?:dollars?|usd|bucks)\s*(?:an?|per|\/|each)\s*(acre[\s-]?f(?:oo|ee)?t|af|megalit(?:re|er)|ml)\b`);
const SUPPLY_RES: { re: RegExp; unit: SupplyUnit }[] = [
  { re: new RegExp(String.raw`${NUM}\s*(?:acre[\s-]?f(?:ee|oo)?t|af)\s*(?:per|an?|\/)\s*acre\b`), unit: "acre-foot-per-acre" },
  { re: new RegExp(String.raw`${NUM}\s*(?:ml|megalit(?:re|er)s?)\s*(?:per|an?|\/)\s*(?:hectare|ha)\b`), unit: "ml-per-hectare" },
  { re: new RegExp(String.raw`${NUM}\s*(?:mm|millimet(?:er|re)s?)\b`), unit: "mm" },
  { re: new RegExp(String.raw`${NUM}\s*(?:inches|inch|in\.)(?=\s|$|[,.;])`), unit: "inch" },
  { re: new RegExp(String.raw`${NUM}\s*(?:feet|foot|ft)\b`), unit: "foot" },
];
const BUDGET_RE = new RegExp(String.raw`\$\s*${NUM}\s*(k|thousand|million)?\b|${NUM}\s*(k|thousand|million)\b(?:\s*dollars?)?|${NUM}\s*(?:dollars?|usd)\b|budget\s*(?:of|is)?\s*${NUM}`);
const AREA_RE = new RegExp(String.raw`${NUM}\s*(acres?|hectares?|ha)\b(?![\s-]*f(?:ee|oo)t)`);

const PRIORITY_RES: { re: RegExp; id: PriorityId }[] = [
  { re: /\b(?:run(?:ning)? short|run(?:ning)? out|short of water|shortages?|reliab\w*|dependab\w*|enough water|never short)\b/g, id: "dependable-water" },
  { re: /\b(?:sav(?:e|ing) water|use less water|using less water|less water|conserv\w*)\b/g, id: "use-less-water" },
  { re: /\b(?:water bill|costs?|cheap\w*|expensive|afford\w*|save money|saving money)\b/g, id: "low-water-cost" },
  { re: /\b(?:soil|nutrients?|sustainab\w*|overus\w*|over-us\w*|the ground|nitrogen)\b/g, id: "protect-soil-nutrients" },
  { re: /\b(?:variety|divers\w*|mix|different crops)\b/g, id: "grow-more-crops" },
];
const SPLIT_RE = /\b(?:or|versus|vs\.?|compared (?:with|to)|options?)\b/;

/** Reads a farmer's words with fixed rules. Deterministic; unknown things are left out and asked about in `missing`. */
export function parseFarmerText(input: string): Understood {
  let t = (input ?? "").toLowerCase().replace(/[’']/g, "'");
  const m: Mentions = { rotations: [], supply: null, budget: null, waterPrice: null, area: null, priorities: [] };

  const pm = PRICE_RE.exec(t);
  if (pm) {
    const amount = num(pm[1] ?? pm[3]);
    const unit = pm[2] ?? pm[4];
    if (amount > 0) m.waterPrice = { amount, per: /^(?:ml|megalit)/.test(unit) ? "megalitre" : "acre-foot" };
    t = blank(t, pm.index, pm[0].length);
  }

  for (const s of SUPPLY_RES) {
    const sm = s.re.exec(t);
    if (!sm) continue;
    const value = num(sm[1]);
    if (Number.isFinite(value)) m.supply = { value, unit: s.unit, asSaid: input.slice(sm.index, sm.index + sm[0].length).trim() };
    t = blank(t, sm.index, sm[0].length);
    break;
  }

  const bm = BUDGET_RE.exec(t);
  if (bm) {
    const raw = bm[1] ?? bm[3] ?? bm[5] ?? bm[6];
    const mult = bm[2] ?? bm[4];
    const factor = mult === "k" || mult === "thousand" ? 1000 : mult === "million" ? 1_000_000 : 1;
    const amount = num(raw) * factor;
    const after = t.slice(bm.index + bm[0].length, bm.index + bm[0].length + 20);
    const per = /^\s*(?:dollars?\s*)?(?:per|an?|\/)\s*acre\b/.test(after) ? "acre" : "total";
    if (amount > 0) m.budget = { amount, per };
    t = blank(t, bm.index, bm[0].length);
  }

  const am = AREA_RE.exec(t);
  if (am) {
    const value = num(am[1]);
    if (value > 0) m.area = { value, unit: am[2].startsWith("h") ? "hectare" : "acre" };
  }

  // Crops in order of mention, split into options on "or", "versus", "compared with", "option".
  for (const seg of t.split(SPLIT_RE)) {
    const found: { at: number; word: string }[] = [];
    for (const s of [...CROP_SYNONYMS.map((x) => x.re), OTHER_CROPS]) {
      const g = new RegExp(s.source, "g");
      let x: RegExpExecArray | null;
      while ((x = g.exec(seg))) if (!found.some((f) => x!.index >= f.at && x!.index < f.at + f.word.length)) found.push({ at: x.index, word: x[0] });
    }
    found.sort((a, b) => a.at - b.at);
    if (found.length) m.rotations.push(found.map((f) => f.word));
  }

  const pr: { at: number; id: PriorityId }[] = [];
  for (const p of PRIORITY_RES) {
    const g = new RegExp(p.re.source, "g");
    const x = g.exec(t);
    if (x) pr.push({ at: x.index, id: p.id });
  }
  m.priorities = pr.sort((a, b) => a.at - b.at).map((p) => p.id);

  return fromMentions(m);
}
