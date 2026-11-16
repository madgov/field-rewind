/**
 * The check on the model's reply. This, not the prompt, is what keeps the AI text honest. A reply is shown only if every test passes;
 * otherwise NONE of the model's text is shown and the reasons are returned. No retry, no repair, no partial display.
 */
import { DECADES } from "../replay/types";
import { ADVISOR_SECTION_IDS } from "./model";
import type { AdvisorPayload } from "./payload";

export type AdvisorParagraph = { text: string; facts: string[] };
export type AdvisorSection = { id: (typeof ADVISOR_SECTION_IDS)[number]; heading: string; paragraphs: AdvisorParagraph[] };
export type AdvisorReply = { sections: AdvisorSection[]; notAvailable: string[] };

export type GuardResult = { ok: true; reply: AdvisorReply } | { ok: false; reasons: string[] };

/** Numerals that may appear anywhere because the app's own labels state them: the 1986 to 2025 replay (40 seasons), the 1985 record start, the 50 km grid. */
export const GLOBAL_NUMERALS: readonly string[] = [
  "1985", "1986", "2025", "40", "50",
  // The four replay decades (1986-1995, 1996-2005, 2006-2015, 2016-2025) are fixed labels of the app.
  ...DECADES.flatMap((d) => [String(d.startYear), String(d.endYear)]),
];

const NUMBER_WORDS =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|half|twice|double|triple|quarter)\b/i;
const MONEY = /\b(profit|profitable|income|revenue|earnings?|price|prices|cost|costs|dollars?|money|cheap|expensive)\b|[$€£₹]/i;
const TEXTURE = /\b(clay|loam|loamy|sandy|silty|silt|sand)\b/i;

/** Resolve "water.rotations[0].seasonsShort" against the payload. Returns undefined when any step is missing. */
export function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split(".").flatMap((seg) => {
    if (/^\d+$/.test(seg)) return [Number(seg)]; // "metrics.0.label" is read as "metrics[0].label"
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)((?:\[\d+\])*)$/.exec(seg);
    if (!m) return [null];
    const out: (string | number)[] = [m[1]];
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]));
    return out;
  });
  if (parts.length === 0 || parts.some((p) => p === null)) return undefined;
  let cur: unknown = root;
  for (const p of parts as (string | number)[]) {
    if (typeof p === "number") {
      if (!Array.isArray(cur) || p >= cur.length) return undefined;
      cur = cur[p];
    } else {
      if (!cur || typeof cur !== "object" || Array.isArray(cur) || !Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  return cur;
}

/** Every numeral in a value (numbers, rounded to 0 to 2 places, and digits inside strings), as normalised strings. */
export function numeralsIn(value: unknown, into: Set<string> = new Set()): Set<string> {
  const addNumber = (n: number) => {
    if (!Number.isFinite(n)) return;
    into.add(String(n));
    for (const dp of [0, 1, 2]) into.add(String(Math.round(n * 10 ** dp) / 10 ** dp));
  };
  const walk = (v: unknown): void => {
    if (typeof v === "number") addNumber(v);
    else if (typeof v === "string") for (const m of v.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const raw = m[0].replace(/,/g, "");
      into.add(raw);
      if (raw.includes(".")) into.add(String(Number(raw)));
    }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return into;
}

const MIN_QUOTE_LENGTH = 12;

function stringsIn(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    if (value.length >= MIN_QUOTE_LENGTH) into.push(value);
  } else if (Array.isArray(value)) value.forEach((x) => stringsIn(x, into));
  else if (value && typeof value === "object") Object.values(value).forEach((x) => stringsIn(x, into));
}

/** Remove, longest first, every cited string that appears verbatim (ignoring case) in the text. */
function stripQuotes(text: string, strings: string[]): string {
  let out = text;
  for (const q of [...new Set(strings)].sort((a, b) => b.length - a.length)) {
    const i = out.toLowerCase().indexOf(q.toLowerCase());
    if (i >= 0) out = out.split(out.slice(i, i + q.length)).join(" ");
  }
  return out;
}

function replyNumerals(text: string): string[] {
  const cleaned = text.replace(/P2O5|K2O|ET0/gi, "");
  return Array.from(cleaned.matchAll(/\d[\d,]*(?:\.\d+)?/g), (m) => m[0].replace(/,/g, ""));
}

const TOP_LEVEL_UNAVAILABLE = ["soil", "erosion", "landCover", "water"] as const;

export function unavailableSections(p: AdvisorPayload): string[] {
  return TOP_LEVEL_UNAVAILABLE.filter((k) => (p[k] as { status?: string }).status === "not-available");
}

function parseReply(raw: string): { reply?: AdvisorReply; reason?: string } {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return { reason: "The reply was not valid JSON." };
  }
  const o = j as Partial<AdvisorReply> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.sections) || !Array.isArray(o.notAvailable)) return { reason: "The reply did not have the expected sections and notAvailable lists." };
  if (!o.notAvailable.every((x) => typeof x === "string")) return { reason: "notAvailable must be a list of names." };
  if (o.sections.length === 0 || o.sections.length > 4) return { reason: "The reply must have between 1 and 4 sections." };
  for (const s of o.sections) {
    if (!s || typeof s !== "object" || typeof s.heading !== "string" || !Array.isArray(s.paragraphs) || !(ADVISOR_SECTION_IDS as readonly string[]).includes(s.id as string))
      return { reason: "A section was malformed." };
    if (s.paragraphs.length === 0 || s.paragraphs.length > 3) return { reason: "Each section needs between 1 and 3 paragraphs." };
    for (const para of s.paragraphs)
      if (!para || typeof para.text !== "string" || !Array.isArray(para.facts) || !para.facts.every((f) => typeof f === "string")) return { reason: "A paragraph was malformed." };
  }
  return { reply: o as AdvisorReply };
}

export function checkReply(raw: string, payload: AdvisorPayload): GuardResult {
  const parsed = parseReply(raw);
  if (!parsed.reply) return { ok: false, reasons: [parsed.reason!] };
  const reply = parsed.reply;
  const reasons: string[] = [];
  const allowedGlobal = new Set<string>(GLOBAL_NUMERALS);

  for (const s of reply.sections) {
    if (/\d/.test(s.heading)) reasons.push(`The heading "${s.heading}" contains a number.`);
    s.paragraphs.forEach((para, pi) => {
      const where = `${s.id} paragraph ${pi + 1}`;
      if (para.facts.length === 0) {
        reasons.push(`${where} cites no facts.`);
        return;
      }
      const allowed = new Set<string>(allowedGlobal);
      const quotable: string[] = [];
      for (const f of para.facts) {
        const broad = !(f.includes(".") || /\[\d+\]$/.test(f));
        const v = resolvePath(payload, f);
        if (v === undefined) reasons.push(`${where} cites "${f}", which is not in the data package.`);
        else if (broad) reasons.push(`${where} cites "${f}", which is too broad.`);
        else {
          numeralsIn(v, allowed);
          stringsIn(v, quotable);
        }
      }
      // A sentence copied word for word from a cited string is the data's own wording, not the model's, so the word checks skip it.
      const text = stripQuotes(para.text, quotable);
      for (const n of replyNumerals(para.text))
        if (!allowed.has(n) && !allowed.has(String(Number(n)))) reasons.push(`${where} contains the number ${n}, which is not at any path it cites.`);
      const w = NUMBER_WORDS.exec(text);
      if (w) reasons.push(`${where} spells a quantity as a word ("${w[0]}"); numbers must be digits copied from the data.`);
      if (MONEY.test(text)) reasons.push(`${where} talks about money or price; no prices are connected.`);
      if (payload.soil.status === "not-available" && TEXTURE.test(text) && !para.facts.some((f) => f.startsWith("soil.")))
        reasons.push(`${where} describes soil texture although soil is not available.`);
      if (payload.landCover.status === "ok" && payload.landCover.notCropland && /\byour (field|farm)\b/i.test(text))
        reasons.push(`${where} calls the point your field or farm, but the satellite record says it is not cropland.`);
      if (/\b(will|going to) (be|have|happen|get)\b|\bforecast(s|ed)?\b|\bpredict/i.test(text) && !/not a forecast|not predict/i.test(text))
        reasons.push(`${where} sounds like a forecast; the replay is the past record.`);
    });
  }

  const missing = unavailableSections(payload).filter((k) => !reply.notAvailable.includes(k));
  if (missing.length) reasons.push(`The reply does not say that ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not available.`);
  const bogus = reply.notAvailable.filter((k) => !(TOP_LEVEL_UNAVAILABLE as readonly string[]).includes(k) || !unavailableSections(payload).includes(k));
  if (bogus.length) reasons.push(`The reply lists ${bogus.join(", ")} as not available, but they are available.`);

  return reasons.length ? { ok: false, reasons } : { ok: true, reply };
}
