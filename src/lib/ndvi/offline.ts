import { offlineFromEnv } from "../power/offline";
export { OFFLINE_ENV, offlineFromEnv } from "../power/offline";

export const NDVI_OFFLINE_MESSAGE =
  "Offline mode is on (FIELD_REWIND_OFFLINE), so this server is not allowed to contact the Landsat archive. Only the saved example places (Brentwood, Fresno, Ludhiana) have satellite vegetation data.";

export const isNdviOffline = (env?: Record<string, string | undefined>) => offlineFromEnv(env);
