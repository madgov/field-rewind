/** Offline switch for the NASA POWER service. No node imports here, so UI code can use the message text. */
export const OFFLINE_ENV = "FIELD_REWIND_OFFLINE";

/** True when FIELD_REWIND_OFFLINE is set to 1, true, yes or on. */
export function offlineFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return ["1", "true", "yes", "on"].includes((env[OFFLINE_ENV] ?? "").trim().toLowerCase());
}

export const OFFLINE_MESSAGE =
  "Offline mode is on (FIELD_REWIND_OFFLINE), so this server is not allowed to contact NASA POWER. Only the saved example places (Brentwood, Fresno, Ludhiana) are available.";
