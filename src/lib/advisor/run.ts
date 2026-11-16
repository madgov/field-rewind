import { checkReply } from "./guard";
import type { AdvisorReply } from "./guard";
import { FREE_TIER_NOTICE, MODEL_SYSTEM_PROMPT, ModelError, RESPONSE_SCHEMA, userMessage } from "./model";
import type { ModelCaller } from "./model";
import type { AdvisorPayload } from "./payload";

export const AI_LABEL = "Written by AI (Google Gemini) from the numbers on this page. Check it against a local soil test and your extension office.";

export type AdvisorOutcome =
  | { status: "ok"; reply: AdvisorReply; label: string; notice: string; generatedAt: string; model: string; /** 2 when the first reply failed the check and one repair attempt passed it. */ attempts: number; /** Added by the route: which letter is which of the farmer's own rotation names. */ rotationKey?: string[] }
  | { status: "rejected"; reasons: string[]; message: string }
  | { status: "not-connected"; message: string }
  | { status: "error"; kind: ModelError["kind"]; message: string };

export const NOT_CONNECTED_MESSAGE =
  "The AI field advisor is not connected. It needs a free Gemini API key set as GEMINI_API_KEY on the server (create one in Google AI Studio). Nothing is written in its place. The computed results on this page are unaffected.";

/** `payload` must be the object that was (or will be) sent to the model, i.e. the output of forModel(). */
/** The route may run for 60 s in all. If the first attempt used more than this, there is no time left for the repair attempt. */
export const REPAIR_DEADLINE_MS = 25_000;

export async function runAdvisor(payload: AdvisorPayload | null, call: ModelCaller | null, model: string, now: () => Date = () => new Date()): Promise<AdvisorOutcome> {
  if (!call || !payload) return { status: "not-connected", message: NOT_CONNECTED_MESSAGE };
  const started = now().getTime();
  let used = model;
  let feedback: string[] | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let text: string;
    try {
      ({ text, model: used = model } = await call({ system: MODEL_SYSTEM_PROMPT, user: userMessage(payload, feedback), schema: RESPONSE_SCHEMA, feedback }));
    } catch (e) {
      if (e instanceof ModelError) return { status: "error", kind: e.kind, message: e.message };
      return { status: "error", kind: "unavailable", message: "The AI service could not be reached." };
    }
    const checked = checkReply(text, payload);
    if (checked.ok) return { status: "ok", reply: checked.reply, label: AI_LABEL, notice: FREE_TIER_NOTICE, generatedAt: now().toISOString(), model: used, attempts: attempt };
    // One repair attempt: the same reasons go back to the model. Anything it returns goes through the same check, and a reply that fails twice is not shown.
    feedback = checked.reasons.slice(0, 12);
    const outOfTime = now().getTime() - started > REPAIR_DEADLINE_MS;
    if (attempt === 2 || outOfTime)
      return {
        status: "rejected",
        reasons: checked.reasons,
        message: `AI summary not shown: it did not pass the check that every figure comes from your data, ${attempt === 2 ? "even after one retry" : "and there was no time left to retry"}. The computed results above are unaffected.`,
      };
  }
  return { status: "error", kind: "unavailable", message: "The AI service could not be reached." };
}
