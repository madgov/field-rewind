/**
 * Shared contract for the farmer assistant (/ask): place search and "what we understood" from the farmer's own words.
 * Nothing here is a computed farm figure. Understanding only turns speech or typing into choices; every number in the plan
 * is still computed on the server by the advisor route from real data.
 */
import type { PriorityId } from "../farmer/priorities";

export type GeocodeResult = { name: string; lat: number; lon: number };

export type GeocodeResponse =
  | { status: "ok"; results: GeocodeResult[]; source: string; sourceUrl: string; fetchedAt: string }
  | { status: "error"; message: string };

export type Understood = {
  /** 1 to 3 rotations, crop ids from the sourced catalog only. Empty when no known crop was heard. */
  rotations: { name: string; sequence: string[] }[];
  /** Seasonal water supply in mm, converted by code from what was said. null when not said. */
  supplyMm: number | null;
  /** The farmer's own words for the supply, e.g. "2.5 acre-feet per acre". */
  supplyAsSaid: string | null;
  /** Irrigation budget as said. Amounts stay in the browser; they are never sent to the AI plan. */
  budget: { amount: number; per: "acre" | "total" | "unknown" } | null;
  /** Water price as said, in US dollars. */
  waterPrice: { amount: number; per: "acre-foot" | "megalitre" } | null;
  acres: number | null;
  priorities: PriorityId[];
  /** Crops the farmer named that are not in the sourced catalog. Shown, never guessed at. */
  unmatchedCrops: string[];
  /** Plain questions for what is still needed before a plan can run (for example the water supply). */
  missing: string[];
};

export type UnderstandResponse =
  | { status: "ok"; method: "ai" | "rules"; model?: string; understood: Understood; notice: string }
  | { status: "error"; message: string };
