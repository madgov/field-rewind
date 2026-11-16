import { buildScenarioResponse, validateRequest } from "@/lib/advisor/server";

export const maxDuration = 60;

const MAX_BODY_BYTES = 20_000;

/**
 * POST: place, rotations, supply and what-if settings in; as-recorded and what-if replays side by side out.
 * The daily weather record stays on the server (the page only holds the supply-independent season table), so the what-if is
 * run here through the existing engine on a transformed copy of the real record. No key, no model.
 */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ status: "error", message: "The request is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ status: "error", message: "The request was not valid JSON." }, { status: 400 });
  }
  const v = validateRequest(body);
  if (!v.ok) return Response.json({ status: "error", message: v.message }, { status: 400 });
  const out = await buildScenarioResponse(v.req);
  if (out.status === "error") return Response.json({ status: "error", message: out.message }, { status: out.httpStatus });
  return Response.json(out);
}
