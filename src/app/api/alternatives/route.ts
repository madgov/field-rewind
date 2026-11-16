import { usableCrops } from "@/lib/crops/catalog";
import { DEMO_PINS } from "@/lib/demoPins";
import { EXAMPLE_FARM_PIN } from "@/lib/advisor/server";
import { rankAlternatives } from "@/lib/alternatives";
import { getPowerData, loadSavedDemoPin } from "@/lib/power";
import { validateCoordinates } from "@/lib/power/grid";
import { validateSupply } from "@/lib/replay/evaluate";

export const maxDuration = 60;

const MAX_BODY_BYTES = 5_000;
const REGION_NOTE = "NASA POWER regional climate, about 50 km grid. Reanalysis, not a sensor on your farm.";

/**
 * POST {lat, lon, supplyMm, current?, exampleFarm?}: every usable crop modelled alone at that supply over the real 1986-2025
 * record and two what-ifs of it, ranked by how often its water need fit. The POWER offline switch is honoured by getPowerData.
 */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ status: "error", message: "The request is too large." }, { status: 413 });
  let body: { lat?: unknown; lon?: unknown; supplyMm?: unknown; current?: unknown; exampleFarm?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ status: "error", message: "The request was not valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ status: "error", message: "The request was not understood." }, { status: 400 });
  const example = body.exampleFarm === true;
  const pin = DEMO_PINS.find((p) => p.id === EXAMPLE_FARM_PIN)!;
  const lat = example ? pin.lat : Number(body.lat);
  const lon = example ? pin.lon : Number(body.lon);
  const badPlace = validateCoordinates(lat, lon);
  if (badPlace) return Response.json({ status: "error", message: badPlace }, { status: 400 });
  const supplyMm = Number(body.supplyMm);
  const badSupply = validateSupply(supplyMm);
  if (badSupply) return Response.json({ status: "error", message: badSupply }, { status: 400 });
  const crops = usableCrops();
  const ids = new Set(crops.map((c) => c.id));
  const current = Array.isArray(body.current) ? body.current.filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, 20) : [];

  const power = example ? await loadSavedDemoPin(EXAMPLE_FARM_PIN) : await getPowerData(lat, lon);
  if (power.status === "error" || power.status === "no-coverage")
    return Response.json({ status: "error", message: power.message ?? "The climate record could not be read for this spot." }, { status: 502 });

  const out = rankAlternatives(power, supplyMm, crops, current);
  if (out.status !== "ok") return Response.json({ status: "error", message: `${out.reason} ${out.nextStep}`.trim() }, { status: 422 });
  return Response.json({ ...out, regionNote: REGION_NOTE });
}
