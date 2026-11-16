/**
 * Server-side assembly of the advisor payload from a small request. The browser sends only choices (place, rotations, supply,
 * yields, priorities); every figure is re-computed here from the same saved or live data the pages use, so the model never
 * sees numbers a browser made up. Server-only: reads files and the network.
 */
import { CROP_CATALOG, usableCrops } from "../crops/catalog";
import { DEMO_PINS } from "../demoPins";
import { PRIORITIES } from "../farmer/priorities";
import type { PriorityId } from "../farmer/priorities";
import { getGroundTruth, loadSavedGroundTruth } from "../groundTruth";
import { matchDemoPin } from "../groundTruth/service";
import type { GroundTruthResult } from "../groundTruth/types";
import { getLandform, landformOriginLine, loadSavedLandform } from "../landform";
import type { LandformResult } from "../landform/types";
import { getPowerData, loadSavedDemoPin } from "../power";
import { validateCoordinates } from "../power/grid";
import { powerDataLabel } from "../power/label";
import { replay } from "../replay/replay";
import { validateSupply } from "../replay/evaluate";
import { computeShift } from "../shift/compute";
import { summarizeAnnual } from "../summary/annual";
import { julyMeanTmax } from "../summary/julyTmax";
import type { PowerResult } from "../types";
import { buildAdvisorPayload } from "./payload";
import type { AdvisorPayload } from "./payload";

export const EXAMPLE_FARM_PIN = "brentwood";
const GROUND_TRUTH_BUDGET_MS = 25_000;

export type AdvisorRequest = {
  lat: number;
  lon: number;
  /** Use the committed saved Brentwood response, never the network. */
  exampleFarm?: boolean;
  rotations: { name: string; sequence: string[] }[];
  supplyMm: number;
  /** Yield per acre in each crop's own unit. Crops with no yield are left out (unknown, not zero). */
  yields: Record<string, number>;
  priorities: PriorityId[];
  price?: { units: "us" | "metric"; waterPrice: number };
  /** Set by the browser only to say the farmer typed a budget; the amounts themselves are never sent. */
  budgetUsed?: boolean;
};

export type AdvisorDeps = {
  power?: (lat: number, lon: number, example: boolean) => Promise<PowerResult>;
  landform?: (lat: number, lon: number, pinId: string | null) => Promise<LandformResult>;
  groundTruth?: (lat: number, lon: number, pinId: string | null) => Promise<GroundTruthResult | null>;
};

export type BuiltAdvisor = { payload: AdvisorPayload; placeName: string | null; rotationKey: string[] } | { error: string; status: number };

const LETTERS = ["A", "B", "C"];

/**
 * Rotation names are free text from the browser and often contain digits ("Rotation 1"), which would widen what the reply check
 * accepts and would send whatever a farmer typed to an outside service. The model sees "Rotation A (crops...)" instead; the key maps
 * the letters back to the farmer's own names for display.
 */
export function anonymizeRotations(rotations: AdvisorRequest["rotations"]): { renamed: AdvisorRequest["rotations"]; key: string[] } {
  const renamed = rotations.map((r, i) => ({
    name: `Rotation ${LETTERS[i] ?? String(i)} (${r.sequence.map((id) => CROP_CATALOG.crops.find((c) => c.id === id)?.name ?? id).join(", then ")})`,
    sequence: r.sequence,
  }));
  return { renamed, key: rotations.map((r, i) => `${renamed[i].name} is "${r.name}"`) };
}

const defaultDeps: Required<AdvisorDeps> = {
  power: (lat, lon, example) => (example ? loadSavedDemoPin(EXAMPLE_FARM_PIN) : getPowerData(lat, lon)),
  landform: (lat, lon, pinId) => (pinId ? loadSavedLandform(pinId) : getLandform(lat, lon)),
  groundTruth: async (lat, lon, pinId) => {
    if (pinId) return loadSavedGroundTruth(pinId);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), GROUND_TRUTH_BUDGET_MS));
    return Promise.race([getGroundTruth(lat, lon), timeout]);
  },
};

export function validateRequest(raw: unknown): { ok: true; req: AdvisorRequest } | { ok: false; message: string } {
  const r = raw as Partial<AdvisorRequest> | null;
  if (!r || typeof r !== "object") return { ok: false, message: "The request was not understood." };
  const bad = validateCoordinates(Number(r.lat), Number(r.lon));
  if (bad) return { ok: false, message: bad };
  if (!Array.isArray(r.rotations) || r.rotations.length < 1 || r.rotations.length > 3) return { ok: false, message: "Send 1 to 3 rotations." };
  const ids = new Set(CROP_CATALOG.crops.map((c) => c.id));
  for (const rot of r.rotations) {
    if (!rot || typeof rot.name !== "string" || rot.name.length > 80 || !Array.isArray(rot.sequence) || rot.sequence.length < 1 || rot.sequence.length > 6 || !rot.sequence.every((id) => typeof id === "string" && ids.has(id)))
      return { ok: false, message: "A rotation was not valid." };
  }
  const s = validateSupply(r.supplyMm as number);
  if (s) return { ok: false, message: s };
  const yields: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.yields ?? {})) {
    if (!ids.has(k) || typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e6) return { ok: false, message: `The yield for "${k}" was not valid.` };
    yields[k] = v;
  }
  const prios = (Array.isArray(r.priorities) ? r.priorities : []).filter((p): p is PriorityId => typeof p === "string" && p in PRIORITIES);
  const price = r.price && (r.price.units === "us" || r.price.units === "metric") && Number.isFinite(r.price.waterPrice) && r.price.waterPrice > 0 ? { units: r.price.units, waterPrice: r.price.waterPrice } : undefined;
  return {
    ok: true,
    req: {
      lat: Number(r.lat),
      lon: Number(r.lon),
      exampleFarm: r.exampleFarm === true,
      rotations: r.rotations.map((x) => ({ name: x.name, sequence: [...x.sequence] })),
      supplyMm: r.supplyMm as number,
      yields,
      priorities: prios,
      price,
      budgetUsed: r.budgetUsed === true,
    },
  };
}

export async function buildAdvisorRequestPayload(req: AdvisorRequest, deps: AdvisorDeps = {}): Promise<BuiltAdvisor> {
  const d = { ...defaultDeps, ...deps };
  const lat = req.exampleFarm ? DEMO_PINS.find((p) => p.id === EXAMPLE_FARM_PIN)!.lat : req.lat;
  const lon = req.exampleFarm ? DEMO_PINS.find((p) => p.id === EXAMPLE_FARM_PIN)!.lon : req.lon;
  const pinId = matchDemoPin(lat, lon);
  const power = await d.power(lat, lon, req.exampleFarm === true);
  if (power.status === "error" || power.status === "no-coverage") return { error: power.message ?? "The climate record could not be read for this spot.", status: 502 };

  const { renamed, key } = anonymizeRotations(req.rotations);
  const rep = replay(power, usableCrops(), { rotations: renamed, supplyMm: req.supplyMm });
  if (rep.status === "unavailable") return { error: `${rep.reason} ${rep.nextStep}`.trim(), status: 422 };

  // Soil and land cover do not depend on each other, so they load together (a new place can take tens of seconds).
  const [lf, gt] = await Promise.all([
    d.landform(lat, lon, pinId).catch((): LandformResult | null => null),
    d.groundTruth(lat, lon, pinId).catch((): GroundTruthResult | null => null),
  ]);
  const place = pinId ? DEMO_PINS.find((p) => p.id === pinId)!.name : null;

  const payload = buildAdvisorPayload({
    pin: { id: pinId, name: place ?? "your location", lat, lon },
    climateOriginLine: powerDataLabel(power),
    shift: computeShift(power),
    annual: summarizeAnnual(power),
    julyTmax: julyMeanTmax(power.days),
    replay: rep,
    soil: lf && lf.status !== "error" ? lf.soil : null,
    erosion: lf && lf.status !== "error" ? lf.erosion : null,
    soilOriginLine: lf && lf.status !== "error" ? landformOriginLine({ origin: lf.origin, fetchedAt: lf.fetchedAt ?? "" }) : null,
    groundTruth: gt,
    rotations: renamed,
    yields: req.yields,
    budget: null,
    priorityOrder: req.priorities,
    price: req.price,
  });
  return { payload, placeName: place, rotationKey: key };
}
