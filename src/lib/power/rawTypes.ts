/** Shape of the NASA POWER daily point JSON response (only the parts we read). */
export type PowerRawResponse = {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: { parameter?: Record<string, Record<string, number | null>> };
  header?: { fill_value?: number; start?: string; end?: string; [k: string]: unknown };
  parameters?: Record<string, { units?: string; longname?: string }>;
  [k: string]: unknown;
};

/** Committed/cached wrapper around the raw responses of one point fetch. */
export type PowerSavedFile = {
  pinId?: string;
  lat: number;
  lon: number;
  /** When the data was really fetched from NASA POWER. */
  fetchedAt: string;
  sourceUrls: string[];
  responses: PowerRawResponse[];
};
