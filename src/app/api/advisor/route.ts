import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODELS, GEMINI_KEY_ENV, GEMINI_MODEL_ENV, createGeminiCaller, forModel } from "@/lib/advisor/model";
import { ADVISOR_OFFLINE_MESSAGE, advisorOffline } from "@/lib/advisor/offline";
import { runAdvisor } from "@/lib/advisor/run";
import { buildAdvisorRequestPayload, validateRequest } from "@/lib/advisor/server";

export const maxDuration = 60;

const MAX_BODY_BYTES = 20_000;

/** POST: choices in, checked AI summary out. The key is read here and nowhere else; it never reaches the browser. */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ status: "error", kind: "bad-request", message: "The request is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ status: "error", kind: "bad-request", message: "The request was not valid JSON." }, { status: 400 });
  }
  const v = validateRequest(body);
  if (!v.ok) return Response.json({ status: "error", kind: "bad-request", message: v.message }, { status: 400 });

  // The offline switch means no outside service is contacted, and Gemini is one.
  if (advisorOffline()) return Response.json({ status: "not-connected", message: ADVISOR_OFFLINE_MESSAGE });

  const key = process.env[GEMINI_KEY_ENV]?.trim();
  const model = process.env[GEMINI_MODEL_ENV]?.trim() || DEFAULT_GEMINI_MODEL;
  // Not connected: answer before doing any data loading or network work.
  if (!key) return Response.json(await runAdvisor(null, null, model));

  const built = await buildAdvisorRequestPayload(v.req);
  if ("error" in built) return Response.json({ status: "error", kind: "data", message: built.error }, { status: built.status });

  const sent = forModel(built.payload, built.placeName);
  const outcome = await runAdvisor(sent, createGeminiCaller(key, [model, ...FALLBACK_GEMINI_MODELS]), model);
  return Response.json(outcome.status === "ok" ? { ...outcome, rotationKey: built.rotationKey } : outcome);
}
