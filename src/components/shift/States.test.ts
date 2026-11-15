// Render tests for the four data states. The fixtures are PowerResult-shaped objects built by the real normalizer from
// test-only raw responses. They live in this test file only and are never reachable from app code.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OFFLINE_MESSAGE } from "@/lib/power/offline";
import { errorResult, normalizePower } from "@/lib/power/normalize";
import { jsonResponse, makeRaw } from "@/lib/power/testFixtures";
import type { PowerResult } from "@/lib/types";
import { EXAMPLE_FARM_LABEL } from "../replay/exampleFarm";
import { LoadingState, PartialNotice, powerProblemScreen } from "./States";

void jsonResponse;
const START = "2025-01-01";
const END = "2025-01-10";
const base = { lat: 37.93, lon: -121.66, fetchedAt: "2026-11-14T10:00:00.000Z", sourceUrls: ["https://power.larc.nasa.gov/x"], origin: "live" as const, start: START, end: END };

const partial: PowerResult = normalizePower({ ...base, responses: [makeRaw({ start: START, end: END, omit: ["2025-01-04", "2025-01-05"] })] });
const noCoverage: PowerResult = normalizePower({
  ...base,
  responses: [makeRaw({ start: START, end: END, set: Object.fromEntries(["T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PRECTOTCORR"].flatMap((p) => Array.from({ length: 10 }, (_, i) => [`${p}|2025-01-${String(i + 1).padStart(2, "0")}`, -999]))) })],
});
const timeout = errorResult({ lat: 10, lon: 20, start: START, end: END, message: "NASA POWER request timed out after 25000 ms" });
const offline = errorResult({ lat: 10, lon: 20, start: START, end: END, message: OFFLINE_MESSAGE });
const html = (node: unknown) => renderToStaticMarkup(node as never);

describe("fixtures have the statuses they claim", () => {
  it("is partial, no-coverage and error", () => {
    expect(partial.status).toBe("partial");
    expect(noCoverage.status).toBe("no-coverage");
    expect(timeout.status).toBe("error");
  });
});

describe("loading state", () => {
  const out = html(h(LoadingState));
  it("says it can take many seconds, that nothing is made up, and offers the example farm", () => {
    expect(out).toContain('role="status"');
    expect(out).toContain("many seconds");
    expect(out).toContain("Nothing is made up");
    expect(out).toContain(EXAMPLE_FARM_LABEL);
    expect(out).toContain("example=1");
  });
});

describe("partial state", () => {
  const out = html(h(PartialNotice, { power: partial, mode: "replay" }));
  it("shows what is missing, how grey seasons are treated, and next steps", () => {
    expect(out).toContain("Some of the weather record is missing");
    expect(out).toContain("2 of 10 days have at least one missing value");
    expect(out).toContain("grey and not judged either way");
    expect(out).toContain("Next step");
    expect(out).toContain("try a pin a little way from this one");
    expect(out).toContain(EXAMPLE_FARM_LABEL);
  });
  it("describes hatched years for the shift page", () => {
    expect(html(h(PartialNotice, { power: partial, mode: "shift" }))).toContain("left out of the averages");
  });
  it("is not shown for ok data (the page only renders it when status is partial)", () => {
    expect(powerProblemScreen(partial, { retryHref: "/replay?x", what: "replay" })).toBeNull();
  });
});

describe("provider error state", () => {
  it("timeout: plain words, exact message, Try again and the example farm", () => {
    const out = html(powerProblemScreen(timeout, { retryHref: "/replay?lat=10.0000&lon=20.0000", what: "replay" }));
    expect(out).toContain("NASA POWER could not give us the weather history");
    expect(out).toContain("took too long to answer");
    expect(out).toContain("never fills the gap with made-up numbers");
    expect(out).toContain("timed out after 25000 ms");
    expect(out).toContain("Try again");
    expect(out).toContain('href="/replay?lat=10.0000&amp;lon=20.0000"');
    expect(out).toContain(EXAMPLE_FARM_LABEL);
    expect(out).toContain("Next step");
  });
  it("offline switch: says it is offline, no Try again, still offers the example farm", () => {
    const out = html(powerProblemScreen(offline, { retryHref: "/shift?x", what: "result" }));
    expect(out).toContain("offline mode");
    expect(out).not.toContain("Try again");
    expect(out).toContain(EXAMPLE_FARM_LABEL);
    expect(out).toContain("FIELD_REWIND_OFFLINE");
  });
});

describe("no-coverage state", () => {
  const out = html(powerProblemScreen(noCoverage, { basePath: "/replay", retryHref: "/replay?x", what: "replay" }));
  it("says NASA POWER has no data and offers another pin or the example farm", () => {
    expect(out).toContain("NASA POWER has no data for this spot");
    expect(out).toContain("Pick another spot on land");
    expect(out).toContain(EXAMPLE_FARM_LABEL);
    expect(out).toContain("/replay?lat=");
  });
});
