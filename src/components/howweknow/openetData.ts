import { DEMO_PINS } from "@/lib/demoPins";
import { getOpenEtMonthly, type ObservedMonth, type OpenEtResult } from "@/lib/openet";
import { NO_KEY_MESSAGE, OPENET_KEY_ENV } from "@/lib/openet/constants";

/** What the panel shows for OpenET: real monthly values with their provenance, or the exact blocker. Never any made-up value. */
export type OpenEtPanel =
  | {
      kind: "data";
      observed: ObservedMonth[];
      /** "Saved response from 2026-11-15" or "Fetched from OpenET ..." */
      originLine: string;
      isSaved: boolean;
      fetchedAt: string;
      unitsReported: string | null;
      /** first and last month with a value, and how many have one */
      range: { first: string | null; last: string | null; withData: number; requested: number };
      provisionalMonths: string[];
      notes: string[];
    }
  | { kind: "blocked"; status: string; message: string; nextStep: string };

const fetchStep = (pinId: string | null) =>
  pinId
    ? `Run \`npx tsx scripts/fetch-openet.ts ${pinId}\` to save a real response (it uses one of the free tier's 100 queries a month), then reload this page.`
    : "OpenET is only fetched for the three example places, by running `npx tsx scripts/fetch-openet.ts <pin>`. The app does not spend OpenET queries on page loads.";

function blockedFromResult(r: OpenEtResult, pinId: string | null): OpenEtPanel {
  const keySet = Boolean(process.env[OPENET_KEY_ENV]?.trim());
  if (r.status === "no-key") {
    if (keySet) {
      return {
        kind: "blocked",
        status: "not-fetched",
        message: "An OpenET key is configured on the server, but no saved OpenET response exists for this place. The app never calls OpenET while a page loads, so no query is spent by looking at this page.",
        nextStep: fetchStep(pinId),
      };
    }
    return {
      kind: "blocked",
      status: "no-key",
      message: NO_KEY_MESSAGE,
      nextStep: "Create a free key at https://account.etdata.org, add it to .env.local as OPENET_API_KEY, run `npx tsx scripts/fetch-openet.ts brentwood` (or fresno), and reload.",
    };
  }
  if (r.status === "no-coverage") {
    return { kind: "blocked", status: "no-coverage", message: r.message ?? "OpenET has no data for this place.", nextStep: "OpenET covers the conterminous United States only. Try one of the California example places to see the comparison." };
  }
  return { kind: "blocked", status: r.status, message: r.message ?? `OpenET status: ${r.status}.`, nextStep: r.status === "quota" ? "Wait for the monthly quota to reset (the 1st, UTC) and run the fetch script again." : fetchStep(pinId) };
}

/** Server only. Uses a saved response when there is one; otherwise explains why there is no data. Never makes a live request. */
export async function loadOpenEtPanel(lat: number, lon: number): Promise<OpenEtPanel> {
  const pin = DEMO_PINS.find((p) => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005) ?? null;
  // apiKey: "" means getOpenEtMonthly can only use a saved file, or report no-coverage / no-key; it cannot spend a query.
  const out = await getOpenEtMonthly(pin ? pin.lat : lat, pin ? pin.lon : lon, { apiKey: "" });
  if (out.source === "saved") {
    const r = out.saved.result;
    const date = out.saved.savedAt.slice(0, 10);
    return {
      kind: "data",
      observed: r.series.map((m) => ({ month: m.month, etMm: m.etMm })),
      originLine: `Saved response from ${date}`,
      isSaved: true,
      fetchedAt: out.saved.savedAt,
      unitsReported: r.unitsReported,
      range: { first: r.coverage?.firstMonth ?? null, last: r.coverage?.lastMonth ?? null, withData: r.coverage?.withData ?? 0, requested: r.coverage?.requestedMonths ?? 0 },
      provisionalMonths: r.coverage?.provisionalMonths ?? [],
      notes: r.message ? [r.message] : [],
    };
  }
  if (out.source === "saved-missing") {
    if (out.saved.status === "saved-error") return { kind: "blocked", status: "saved-error", message: out.saved.message, nextStep: fetchStep(pin?.id ?? null) };
    return blockedFromResult(out.result, pin?.id ?? null);
  }
  return blockedFromResult(out.result, pin?.id ?? null);
}
