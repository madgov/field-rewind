import { searchPlaces, validateQuery } from "@/lib/assistant/geocode";
import type { GeocodeResponse } from "@/lib/assistant/types";
import { offlineFromEnv } from "@/lib/power/offline";

/** GET ?q=place: server-side search on OpenStreetMap Nominatim. No fallback results, ever. */
export async function GET(request: Request): Promise<Response> {
  const v = validateQuery(new URL(request.url).searchParams.get("q"));
  if (!v.ok) return Response.json({ status: "error", message: v.message } satisfies GeocodeResponse, { status: 400 });
  if (offlineFromEnv()) {
    return Response.json({
      status: "error",
      message: "Place search is switched off in offline mode (FIELD_REWIND_OFFLINE). The map still works: tap or click it to choose your field.",
    } satisfies GeocodeResponse);
  }
  const out = await searchPlaces(v.q);
  return Response.json(out, { status: out.status === "ok" ? 200 : 502 });
}
