/** Public types for the CIMIS station check. Safe to import from client components (no node imports). */

/** One day of normalized CIMIS ASCE ETo. etoMm is null when missing or flagged as missing/rejected. */
export type CimisDay = {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Daily ASCE reference ETo in mm/day, or null */
  etoMm: number | null;
  /** CIMIS QC flag exactly as reported with blanks as null (null = no flag, i.e. the blank flag " "). */
  qc: string | null;
};

/**
 * ok            all requested days were fetched (days may still contain nulls)
 * partial       some chunks failed; `days` holds what succeeded, `failedRanges` the rest
 * no-key        CIMIS_APP_KEY is not set; no network call was made
 * error         request or parse failure (message explains; never contains the key)
 * no-saved-data data/cimis/station47.json does not exist (run the fetch script)
 */
export type CimisStatus = "ok" | "partial" | "no-key" | "error" | "no-saved-data";

export type CimisFlagCounts = {
  /** Records per QC flag. The blank flag is counted under "(none)". */
  byFlag: Record<string, number>;
  /** Of those, records whose value became null, per flag (missing value, or a flag treated as missing). */
  nulledByFlag: Record<string, number>;
  totalRecords: number;
  /** Records with a usable (non-null) value */
  usable: number;
  duplicateDates: number;
  /** Records dropped because they belong to another station */
  otherStation: number;
};

export type CimisResult = {
  status: CimisStatus;
  station: 47;
  requested: { start: string; end: string };
  /** First and last date with a non-null ETo value; null when none. */
  coverage: { start: string; end: string } | null;
  /** Unit string as reported by CIMIS, e.g. "(mm)". null when nothing was parsed. */
  unit: string | null;
  /** ISO timestamp of the live fetch (for a saved response: when it was fetched). null when no data. */
  fetchedAt: string | null;
  /** Request URLs with the key replaced by appKey=REDACTED. */
  sourceUrls: string[];
  /** "live" = fetched in this call; "saved" = committed saved response. null when there is no data. */
  origin: "live" | "saved" | null;
  /** For saved data: "saved response from YYYY-MM-DD". Never present for live data. */
  savedLabel?: string;
  days: CimisDay[];
  flags: CimisFlagCounts | null;
  failedRanges?: { start: string; end: string; message: string }[];
  message?: string;
  /** What the user must do next (no-key, no-saved-data). */
  nextStep?: string;
};

export const NO_KEY_MESSAGE =
  "CIMIS_APP_KEY is not set; the user must register at https://et.water.ca.gov and put the key in .env.local, then run `npx tsx scripts/fetch-cimis.ts`";
export const NO_SAVED_NEXT_STEP =
  "Register for a free CIMIS app key at https://et.water.ca.gov, put it in .env.local as CIMIS_APP_KEY, then run `npx tsx scripts/fetch-cimis.ts` to create data/cimis/station47.json.";

/** Shape of the saved file data/cimis/station47.json. */
export type CimisSavedFile = {
  station: 47;
  fetchedAt: string;
  /** Redacted: appKey=REDACTED */
  sourceUrls: string[];
  /** Raw response bodies, one per request, as returned by CIMIS. */
  responses: unknown[];
};
