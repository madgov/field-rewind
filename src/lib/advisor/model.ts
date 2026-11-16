/**
 * The model side of the AI field advisor: what is sent, what is asked, and the shape of the answer.
 * Provider: Google Gemini API (free tier). The key is read on the server only, from GEMINI_API_KEY.
 *
 * Privacy: on the free tier Google states that content is "used to improve our products" (pricing page, read 2026-11-15). So
 * what is sent is trimmed by forModel(): coordinates rounded to the half-degree grid POWER already uses, no money amounts, no
 * field area, no exact place name for an undefined point.
 */
import { GoogleGenAI, ApiError, ThinkingLevel } from "@google/genai";
import type { AdvisorPayload } from "./payload";

export const GEMINI_KEY_ENV = "GEMINI_API_KEY";
export const GEMINI_MODEL_ENV = "GEMINI_MODEL";
/** A model the Gemini pricing page lists as free of charge (read 2026-11-15). Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const FREE_TIER_NOTICE =
  "This summary is written by Google's free Gemini service. On the free tier Google says content sent to it may be used to improve its products. What is sent is the computed results shown on this page, your yields and priorities, and your location rounded to the 50 km grid. No money amounts (budget, water price, water cost) and no field size are sent.";

export type ModelRequest = { system: string; user: string; schema: object; /** Reasons the previous reply was rejected, for the one repair attempt. */ feedback?: string[] };
/** `model` is the model that actually answered (it can differ from the first choice when that one was busy). */
export type ModelCaller = (req: ModelRequest) => Promise<{ text: string; model?: string }>;

/**
 * Other models the Gemini pricing page lists as free of charge, tried in order when the first choice is busy, overloaded, out of quota
 * or not found. On 2026-11-16 the first choice returned "high demand" (503) and then timed out, while the first fallback answered in seconds. Free-tier quota is per model, so each fallback also adds capacity; the lite models are smaller, and every reply is checked the same way whichever model wrote it.
 * Whichever model answers is named on the page.
 */
export const FALLBACK_GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;
export const ATTEMPT_TIMEOUT_MS = 20_000;

export class ModelError extends Error {
  constructor(public kind: "rate-limited" | "key-rejected" | "model-missing" | "unavailable" | "blocked" | "empty" | "truncated", message: string) {
    super(message);
  }
}

export const MODEL_SYSTEM_PROMPT = `You write a short plain-English summary for a farmer from a JSON data package. The package was computed by code from real data. You only restate and connect what is in it.

Rules, all of them strict:
1. Use only facts in the package. Never add a number, crop value, price, yield, forecast or claim that is not in it. Do not do arithmetic: no percentages, no totals, no differences, no averages that are not already in the package.
2. Write every quantity as digits copied from the package (for example "22 of 40 seasons"). Never spell a number as a word from two upward, and never use words like half, twice, double or dozen.
3. Every paragraph must list in "facts" the exact paths in the package it relies on, written like water.rotations[0].seasonsShort or soil.organicMatterTopPct. Paths start at the top of the package (its top-level keys are location, climate, water, soil, erosion, landCover, nutrients, priorities, expertise, limits), for example priorities[0].best[0] and limits[1]. Never cite a bare top-level key such as limits or water, and never invent a path. A paragraph may only use numbers found at the paths it lists: list a path for EVERY figure in the paragraph, including counts, years, decade labels, the 41 years of a mean, and units like 50 km, and do not write any number you have not listed a path for.
4. If a part of the package has status "not-available", say plainly that it is not available and why, list its top-level name in "notAvailable" (soil, erosion, landCover or water), and do not guess at it.
5. Where a value is null, or a nutrient or replenishment is "unknown", say it is unknown. Unknown is not zero.
6. Climate is "regional climate, about 50 km grid": reanalysis, not a farm sensor. The replay is the real 1986 to 2025 record, not a forecast.
7. Nutrient figures are published averages of what leaves in the harvested crop. They are not a soil test. Say so once, in the nutrients section.
8. Do not mention profit, income, price, cost, revenue, money or any currency, and do not recommend fertilizer products or amounts. No money figures are in the package.
9. If landCover.notCropland is true, do not call the place a field or a farm.
10. Follow the farmer's priorities in the package, in order. Do not hide a trade-off: if a rotation is best on one priority and worst on another, say so.
11. Say P and K as "phosphorus" and "potassium", never as P2O5 or K2O.
12. Never print a raw field value or code such as none-known or not-available; say "unknown" or "not available" in plain words. If the package's limits say the place looks to be outside California, say in the first section that the crop values are California values and may not match local practice there. If landCover.notCropland is true, say in the first section that the satellite record does not class this point as cropland.
13. Give plain guidance about not over-drawing water or nutrients in a season and keeping the ground sustainable over time, but only tied to numbers and flags in the package. If the package cannot support a recommendation, say what is missing instead.
Plain English, short sentences, no jargon. At most 4 sections and 3 paragraphs per section.`;

export const ADVISOR_SECTION_IDS = ["water", "nutrients", "soil", "plan"] as const;

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: [...ADVISOR_SECTION_IDS] },
          heading: { type: "string" },
          paragraphs: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" }, facts: { type: "array", items: { type: "string" } } },
              required: ["text", "facts"],
            },
          },
        },
        required: ["id", "heading", "paragraphs"],
      },
    },
    notAvailable: { type: "array", items: { type: "string" } },
  },
  required: ["sections", "notAvailable"],
};

function round(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** The trimmed copy that is actually sent. The reply is checked against THIS object, so nothing the model never saw can be cited. */
export function forModel(p: AdvisorPayload, placeName: string | null): AdvisorPayload {
  const copy = JSON.parse(JSON.stringify(p)) as AdvisorPayload;
  copy.location = {
    id: p.location.id,
    name: placeName ?? "a location (not named; shown only as a point on the 50 km grid)",
    lat: round(p.location.lat, 0.5),
    lon: round(p.location.lon, 0.5),
  };
  if (copy.water.status === "ok") copy.water.supplyFromBudget = null;
  // The water-cost priority is derived from the farmer's water price, so it is a money amount. It stays on the page and is not sent.
  copy.priorities = copy.priorities.filter((x) => x.priority !== "low-water-cost");
  return copy;
}

export function userMessage(p: AdvisorPayload, feedback?: string[]): string {
  const base = `Data package (JSON). Write the summary now.\n\n${JSON.stringify(p)}`;
  if (!feedback || feedback.length === 0) return base;
  return `${base}\n\nYour previous reply was rejected by an automatic check for these reasons:\n${feedback.map((f) => `- ${f}`).join("\n")}\nWrite the whole summary again so that none of these happens. Cite a path for every figure you write, use only real paths from the package, and drop any sentence you cannot support.`;
}

/** Real Gemini call through the official SDK (@google/genai). Not used in tests against Google; tests inject a ModelCaller or a local stand-in. */
export function createGeminiCaller(
  apiKey: string,
  models: string | readonly string[] = DEFAULT_GEMINI_MODEL,
  opts: { baseUrl?: string; timeoutMs?: number; busyRetryDelayMs?: number } = {},
): ModelCaller {
  const ai = new GoogleGenAI({ apiKey, ...(opts.baseUrl ? { httpOptions: { baseUrl: opts.baseUrl } } : {}) });
  const list = Array.from(new Set(typeof models === "string" ? [models] : models));
  const timeoutMs = opts.timeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const busyRetryDelayMs = opts.busyRetryDelayMs ?? 1500;

  const once = async (model: string, { system, user, schema }: ModelRequest): Promise<{ text: string; model: string }> => {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          // Gemini counts its private thinking against this limit. A first live run with 8192 came back cut off mid-sentence.
          maxOutputTokens: 16384,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });
      const blocked = res.promptFeedback?.blockReason;
      if (blocked) throw new ModelError("blocked", `Gemini declined the request (${String(blocked)}).`);
      if (res.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new ModelError("truncated", `${model} stopped before finishing its answer (it ran out of output space). Nothing was shown.`);
      const text = res.text;
      if (!text || !text.trim()) throw new ModelError("empty", "Gemini returned no text.");
      return { text, model };
    } catch (e) {
      if (e instanceof ModelError) throw e;
      if (e instanceof ApiError) {
        if (e.status === 429) throw new ModelError("rate-limited", `The free Gemini limit for ${model} has been reached. Try again in a minute.`);
        if (e.status === 404) throw new ModelError("model-missing", `Gemini does not know the model "${model}". Set GEMINI_MODEL to a current free-tier model from the Gemini pricing page.`);
        if (e.status === 400 || e.status === 401 || e.status === 403) throw new ModelError("key-rejected", `Gemini rejected the request or the key (HTTP ${e.status}). Check GEMINI_API_KEY and GEMINI_MODEL.`);
        if (e.status === 503) throw new ModelError("unavailable", `Google says ${model} is busy right now (HTTP 503).`);
        throw new ModelError("unavailable", `Gemini returned HTTP ${e.status} for ${model}.`);
      }
      const name = (e as { name?: string } | null)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new ModelError("unavailable", `${model} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
      throw new ModelError("unavailable", "Gemini could not be reached.");
    }
  };

  return async (req) => {
    let last: ModelError | null = null;
    for (const model of list) {
      try {
        try {
          return await once(model, req);
        } catch (e) {
          // "High demand" (503) is usually a spike of a few seconds, so this model gets one more try before the next model is used.
          if (e instanceof ModelError && e.kind === "unavailable" && /HTTP 503/.test(e.message)) {
            await new Promise((r) => setTimeout(r, busyRetryDelayMs));
            return await once(model, req);
          }
          throw e;
        }
      } catch (e) {
        if (!(e instanceof ModelError)) throw e;
        last = e;
        // Only "this model is not usable right now" moves on to the next model. A rejected key or a blocked prompt would fail the same way everywhere.
        if (!["unavailable", "rate-limited", "model-missing"].includes(e.kind)) throw e;
      }
    }
    throw last ?? new ModelError("unavailable", "No Gemini model is configured.");
  };
}
