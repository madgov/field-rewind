import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODELS, GEMINI_KEY_ENV, GEMINI_MODEL_ENV, createGeminiCaller } from "@/lib/advisor/model";
import { advisorOffline } from "@/lib/advisor/offline";
import { parseFarmerText } from "@/lib/assistant/parse";
import type { UnderstandResponse } from "@/lib/assistant/types";
import { MAX_TEXT_CHARS, understandWithModel } from "@/lib/assistant/understand";

export const maxDuration = 30;

const RULES_NOTICE = "Read by fixed rules on our server; no AI was used.";

function bad(message: string, status = 400): Response {
  return Response.json({ status: "error", message } satisfies UnderstandResponse, { status });
}

/** POST {text}: the farmer's words in, structured choices out. Numbers are converted by code, never by the model. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("The request was not valid JSON.");
  }
  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string" || !text.trim()) return bad("Please say or type something about your farm first.");
  if (text.length > MAX_TEXT_CHARS) return bad(`That is too long. Please keep it under ${MAX_TEXT_CHARS} characters.`);

  const key = process.env[GEMINI_KEY_ENV]?.trim();
  if (advisorOffline() || !key) {
    const notice = advisorOffline() ? `${RULES_NOTICE} (Offline mode is on, so Google Gemini is not contacted.)` : RULES_NOTICE;
    return Response.json({ status: "ok", method: "rules", understood: parseFarmerText(text), notice } satisfies UnderstandResponse);
  }

  const model = process.env[GEMINI_MODEL_ENV]?.trim() || DEFAULT_GEMINI_MODEL;
  const out = await understandWithModel(text, createGeminiCaller(key, [model, ...FALLBACK_GEMINI_MODELS], { timeoutMs: 12_000 }), model);
  const res: UnderstandResponse =
    out.method === "ai"
      ? {
          status: "ok",
          method: "ai",
          model: out.model,
          understood: out.understood,
          notice: `Read by Google Gemini (${out.model}). Check it before you continue; your words were sent to Google for this step. All unit conversions were done by our own code.`,
        }
      : { status: "ok", method: "rules", understood: out.understood, notice: `Read by fixed rules on our server; no AI result was used. Google Gemini could not be used: ${out.reason}` };
  return Response.json(res);
}
