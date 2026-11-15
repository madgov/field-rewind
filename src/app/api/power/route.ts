import { getPowerData } from "@/lib/power";
import { errorResult } from "@/lib/power/normalize";
import { validateCoordinates } from "@/lib/power/grid";

export const maxDuration = 60;

function parseNum(v: string | null): number {
  if (v === null || v.trim() === "") return NaN;
  return Number(v);
}

export async function GET(request: Request): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const lat = parseNum(sp.get("lat"));
  const lon = parseNum(sp.get("lon"));
  const bad = validateCoordinates(lat, lon);
  if (bad) {
    return Response.json(errorResult({ lat, lon, coordsValid: false, message: bad }), { status: 400 });
  }
  const fresh = ["1", "true"].includes(sp.get("fresh") ?? "");
  const result = await getPowerData(lat, lon, { fresh });
  return Response.json(result, { status: result.status === "error" ? 502 : 200 });
}
