import { offlineFromEnv } from "../power/offline";

export const ADVISOR_OFFLINE_MESSAGE =
  "Offline mode is on (FIELD_REWIND_OFFLINE), so this server is not allowed to contact Google Gemini. Nothing is sent and no summary is written. The computed results on this page are unaffected.";

/** True when the offline switch is on: the advisor must not call the outside model. */
export function advisorOffline(env: Record<string, string | undefined> = process.env): boolean {
  return offlineFromEnv(env);
}
