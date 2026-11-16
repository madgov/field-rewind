import { beforeAll, describe, expect, it } from "vitest";
import { anonymizeRotations, buildAdvisorRequestPayload, validateRequest } from "./server";
import type { AdvisorRequest } from "./server";
import { checkReply, resolvePath, unavailableSections } from "./guard";
import { ModelError, forModel } from "./model";
import type { ModelCaller } from "./model";
import { MODEL_BUDGET_MS, NOT_CONNECTED_MESSAGE, runAdvisor } from "./run";
import type { AdvisorPayload } from "./payload";

const REQ: AdvisorRequest = {
  lat: 37.93,
  lon: -121.66,
  exampleFarm: true,
  rotations: [
    { name: "Wheat, then maize", sequence: ["winter-wheat", "maize-grain"] },
    { name: "Maize, then cotton", sequence: ["maize-grain", "cotton"] },
  ],
  supplyMm: 700,
  yields: { "winter-wheat": 60, "maize-grain": 150, cotton: 2 },
  priorities: ["dependable-water", "protect-soil-nutrients"],
};

let built: { payload: AdvisorPayload; placeName: string | null };
let sent: AdvisorPayload;
beforeAll(async () => {
  const b = await buildAdvisorRequestPayload(REQ);
  if ("error" in b) throw new Error(b.error);
  built = b;
  sent = forModel(b.payload, b.placeName);
});

function defaultText(): string {
  if (sent.water.status !== "ok") throw new Error("water");
  return `Wheat then maize was short of water in ${sent.water.rotations[0].seasonsShort} of 40 seasons.`;
}

function reply(over: Partial<{ text: string; facts: string[]; notAvailable: string[]; heading: string }> = {}): string {
  return JSON.stringify({
    sections: [{ id: "water", heading: over.heading ?? "Water", paragraphs: [{ text: over.text ?? defaultText(), facts: over.facts ?? ["water.rotations[0].seasonsShort", "water.rotations[0].seasonsJudged"] }] }],
    notAvailable: over.notAvailable ?? [],
  });
}

describe("test data sanity", () => {
  it("uses the real saved Brentwood record and the first rotation's real tally", () => {
    if (sent.water.status !== "ok") throw new Error("water");
    expect(sent.water.rotations[0].seasonsJudged).toBe(40);
    expect(typeof sent.water.rotations[0].seasonsShort).toBe("number");
  });
});

describe("forModel trims what is sent", () => {
  it("rounds coordinates to the half-degree grid and drops money-derived steps", () => {
    const p = forModel({ ...built.payload, location: { id: null, name: "x", lat: 37.9312, lon: -121.6609 } }, null);
    expect(p.location.lat).toBe(38);
    expect(p.location.lon).toBe(-121.5);
    expect(p.location.name).toMatch(/not named/);
    if (p.water.status === "ok") expect(p.water.supplyFromBudget).toBeNull();
  });
  it("does not change the original payload", () => {
    const before = JSON.stringify(built.payload);
    forModel(built.payload, null);
    expect(JSON.stringify(built.payload)).toBe(before);
  });
  it("leaves the water-cost priority out of what is sent, but keeps it in the payload for the page", () => {
    const withPrice = forModel({ ...built.payload, priorities: [{ priority: "low-water-cost", rank: 1, label: "", plain: "", metricLabel: "", unit: "", rows: [], best: [], comparable: false }] }, null);
    expect(withPrice.priorities).toEqual([]);
  });
  it("keeps a demo pin's name", () => {
    expect(sent.location.name).toBe("Brentwood, CA");
  });
});

describe("resolvePath", () => {
  it("resolves objects, arrays and rejects bad paths", () => {
    expect(resolvePath(sent, "water.rotations[0].seasonsJudged")).toBe(40);
    expect(resolvePath(sent, "water.rotations[9].seasonsJudged")).toBeUndefined();
    expect(resolvePath(sent, "water.nope")).toBeUndefined();
    expect(resolvePath(sent, "water..x")).toBeUndefined();
    expect(resolvePath(sent, "__proto__.x")).toBeUndefined();
    expect(resolvePath(sent, "constructor")).toBeUndefined();
    expect(resolvePath(sent, "water.rotations.0.seasonsJudged")).toBe(40);
    expect(resolvePath(sent, "water.0")).toBeUndefined();
    expect(resolvePath(sent, "nutrients.yieldsEntered.winter-wheat")).toBe(60);
    expect(resolvePath(sent, "climate.annualRainMm.firstYear")).toBe(1985);
    expect(resolvePath(sent, "climate.shift.hotDayThresholdC")).toBe(35);
  });
});

describe("checkReply", () => {
  it("accepts a reply whose figures are at the paths it cites", () => {
    if (sent.water.status !== "ok") throw new Error();
    const n = sent.water.rotations[0].seasonsShort;
    const r = checkReply(reply({ text: `Wheat then maize was short of water in ${n} of 40 seasons.` }), sent);
    expect(r.ok).toBe(true);
  });

  it("rejects a made-up figure", () => {
    const r = checkReply(reply({ text: "Wheat then maize was short of water in 987 of 40 seasons." }), sent);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/987, which is not anywhere in your data/);
  });

  it("accepts a real figure from the package even when the paragraph cites the wrong path", () => {
    // Live Gemini replies cited the wrong paths for real figures (35 C threshold, 41 years, period years); those are not made up.
    const r = checkReply(reply({ text: "Hot days are days over 35 C, counted from 1985 to 2025.", facts: ["water.supplyMm"] }), sent);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dropped).toBe(0);
  });

  it("drops only the paragraph with a number not in the package and shows the rest", () => {
    const raw = JSON.stringify({
      sections: [
        { id: "water", heading: "Water", paragraphs: [{ text: defaultText(), facts: ["water.rotations[0].seasonsShort"] }, { text: "It was short in 987 seasons.", facts: ["water.supplyMm"] }] },
        { id: "plan", heading: "Plan", paragraphs: [{ text: "Yields of 4321 are expected.", facts: ["water.supplyMm"] }] },
      ],
      notAvailable: [],
    });
    const r = checkReply(raw, sent);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dropped).toBe(2);
      expect(r.reply.sections.map((x) => x.id)).toEqual(["water"]);
      expect(r.reply.sections[0].paragraphs).toHaveLength(1);
      expect(JSON.stringify(r.reply)).not.toMatch(/987|4321/);
      expect(r.droppedReasons.join(" ")).toMatch(/987/);
    }
  });

  it("rejects the reply when every paragraph fails", () => {
    const raw = JSON.stringify({
      sections: [
        { id: "water", heading: "Water", paragraphs: [{ text: "Short in 987 seasons.", facts: ["water.supplyMm"] }] },
        { id: "plan", heading: "Plan", paragraphs: [{ text: "This will earn more profit.", facts: ["limits[0]"] }] },
      ],
      notAvailable: [],
    });
    expect(checkReply(raw, sent).ok).toBe(false);
  });

  it("a paragraph with no facts is dropped; a wrong or broad path alone is citation bookkeeping, not a made-up figure", () => {
    expect(checkReply(reply({ facts: [] }), sent).ok).toBe(false);
    expect(checkReply(reply({ facts: ["water.rotations[7].seasonsShort"] }), sent).ok).toBe(true);
    expect(checkReply(reply({ facts: ["water"] }), sent).ok).toBe(true);
  });

  it("rejects numbers spelled as words and numbers in headings", () => {
    expect(checkReply(reply({ text: "It was short of water in twelve seasons.", facts: ["water.rotations[0].seasonsShort"] }), sent).ok).toBe(false);
    expect(checkReply(reply({ text: "About half of the seasons were short.", facts: ["water.rotations[0].seasonsShort"] }), sent).ok).toBe(false);
    expect(checkReply(reply({ heading: "Water in 40 seasons" }), sent).ok).toBe(false);
  });

  it("rejects money talk, forecasts and malformed replies", () => {
    expect(checkReply(reply({ text: "This rotation will earn more profit." }), sent).ok).toBe(false);
    expect(checkReply(reply({ text: "Next year will be drier." }), sent).ok).toBe(false);
    expect(checkReply("not json", sent).ok).toBe(false);
    expect(checkReply(JSON.stringify({ sections: [], notAvailable: [] }), sent).ok).toBe(false);
    expect(checkReply(JSON.stringify({ sections: [{ id: "bogus", heading: "x", paragraphs: [{ text: "a", facts: ["water.supplyMm"] }] }], notAvailable: [] }), sent).ok).toBe(false);
  });

  it("allows the unit word percent next to a digit that is in the data, and still rejects a percentage that is not", () => {
    const withPct = { ...sent, soil: { ...(sent.soil as object), organicMatterTopPct: 1.5 } } as AdvisorPayload;
    expect(checkReply(reply({ text: "Organic matter is 1.5 percent.", facts: ["soil.organicMatterTopPct"] }), withPct).ok).toBe(true);
    expect(checkReply(reply({ text: "Organic matter is 62 percent.", facts: ["soil.organicMatterTopPct"] }), withPct).ok).toBe(false);
  });

  it("ignores the ET0 term and accepts the replay's own decade years", () => {
    expect(checkReply(reply({ text: "Reference evapotranspiration (ET0) is high.", facts: ["climate.annualEt0Mm.value"] }), sent).ok).toBe(true);
    expect(checkReply(reply({ text: "Between 1996 and 2005 and 2006 to 2015 it was short.", facts: ["water.supplyMm"] }), sent).ok).toBe(true);
    expect(checkReply(reply({ text: "In 1999 it was short.", facts: ["water.supplyMm"] }), sent).ok).toBe(false);
  });

  it("allows 'not a forecast'", () => {
    const r = checkReply(reply({ text: "This replay is not a forecast.", facts: ["limits[1]"] }), sent);
    expect(r.ok).toBe(true);
  });

  it("never allows the cost word: no money figures are sent", () => {
    expect(checkReply(reply({ text: "Water cost is lowest here." }), sent).ok).toBe(false);
  });

  it("ignores P2O5 and K2O tokens instead of reading their digits as figures", () => {
    const r = checkReply(reply({ text: "Phosphorus (P2O5) leaves with the crop.", facts: ["nutrients.caveat"] }), sent);
    expect(r.ok).toBe(true);
  });

  it("requires the reply to say which layers are not available, and rejects false claims of unavailability", () => {
    const noSoil = { ...sent, soil: { status: "not-available" as const, reason: "US only" } };
    expect(unavailableSections(noSoil)).toContain("soil");
    const missing = checkReply(reply(), noSoil);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reasons.join(" ")).toMatch(/soil/);
    expect(checkReply(reply({ notAvailable: ["soil"] }), noSoil).ok).toBe(true);
    const falseClaim = checkReply(reply({ notAvailable: ["soil"] }), sent);
    expect(falseClaim.ok).toBe(false);
  });

  it("rejects soil-texture talk when soil is not available", () => {
    const noSoil = { ...sent, soil: { status: "not-available" as const, reason: "US only" } };
    const r = checkReply(reply({ text: "The clay soil holds water well.", notAvailable: ["soil"], facts: ["water.supplyMm"] }), noSoil);
    expect(r.ok).toBe(false);
  });

  it("rejects 'your field' when the satellite record says the point is not cropland", () => {
    const dev = { ...sent, landCover: { status: "ok" as const, notCropland: true, classesSeen: ["Developed/Low Intensity"], cropHistory: [], nlcd: "" } };
    expect(checkReply(reply({ text: "Your field is short of water.", facts: ["water.supplyMm"] }), dev).ok).toBe(false);
  });
});

describe("runAdvisor", () => {
  const good: ModelCaller = async () => {
    if (sent.water.status !== "ok") throw new Error();
    return { text: reply({ text: `Wheat then maize was short of water in ${sent.water.rotations[0].seasonsShort} of 40 seasons.` }) };
  };

  it("not connected: says why, calls nothing, writes nothing", async () => {
    let called = false;
    const out = await runAdvisor(null, null, "m");
    expect(out).toEqual({ status: "not-connected", message: NOT_CONNECTED_MESSAGE });
    expect(called).toBe(false);
    expect(NOT_CONNECTED_MESSAGE).toMatch(/GEMINI_API_KEY/);
    called = true;
  });

  it("ok: returns the reply with the AI label, the free-tier notice and a generation time (never 'saved')", async () => {
    const out = await runAdvisor(sent, good, "gemini-test", () => new Date("2026-11-15T12:00:00Z"));
    expect(out.status).toBe("ok");
    if (out.status === "ok") {
      expect(out.label).toMatch(/Written by AI/);
      expect(out.notice).toMatch(/used to improve/);
      expect(out.generatedAt).toBe("2026-11-15T12:00:00.000Z");
      expect(out.model).toBe("gemini-test");
    }
  });

  it("rejected: shows NONE of the model's text", async () => {
    const out = await runAdvisor(sent, async () => ({ text: reply({ text: "Short in 987 of 40 seasons." }) }), "m");
    expect(out.status).toBe("rejected");
    expect(JSON.stringify(out)).not.toMatch(/Short in 987/);
    if (out.status === "rejected") expect(out.message).toMatch(/not shown/);
  });

  it("one failed check gets one repair attempt, with the reasons fed back; a pass on the retry is shown and says so", async () => {
    const users: string[] = [];
    let n = 0;
    const out = await runAdvisor(sent, async (req) => {
      users.push(req.user);
      n++;
      return n === 1 ? { text: reply({ text: "Short in 987 of 40 seasons." }) } : good({ system: "", user: "", schema: {} });
    }, "m");
    expect(out.status).toBe("ok");
    if (out.status === "ok") expect(out.attempts).toBe(2);
    expect(n).toBe(2);
    expect(users[0]).not.toMatch(/previous reply was rejected/);
    expect(users[1]).toMatch(/previous reply was rejected/);
    expect(users[1]).toMatch(/987/);
  });

  it("two failed checks: rejected, exactly two calls, none of the text shown", async () => {
    let n = 0;
    const out = await runAdvisor(sent, async () => { n++; return { text: reply({ text: "Short in 987 of 40 seasons." }) }; }, "m");
    expect(out.status).toBe("rejected");
    expect(n).toBe(2);
    expect(JSON.stringify(out)).not.toMatch(/Short in 987 of 40 seasons/);
  });

  it("an error from the model is not retried", async () => {
    let n = 0;
    const out = await runAdvisor(sent, async () => { n++; throw new ModelError("unavailable", "busy"); }, "m");
    expect(out.status).toBe("error");
    expect(n).toBe(1);
  });

  it("a first-try pass records one attempt", async () => {
    const out = await runAdvisor(sent, good, "m");
    expect(out.status === "ok" && out.attempts).toBe(1);
  });

  it("a reply with one bad paragraph is shown without it, and says how many were removed", async () => {
    const raw = JSON.stringify({
      sections: [{ id: "water", heading: "Water", paragraphs: [{ text: defaultText(), facts: ["water.rotations[0].seasonsShort"] }, { text: "Short in 987 seasons.", facts: ["water.supplyMm"] }] }],
      notAvailable: [],
    });
    let n = 0;
    const out = await runAdvisor(sent, async () => { n++; return { text: raw }; }, "m");
    expect(n).toBe(1);
    expect(out.status).toBe("ok");
    if (out.status === "ok") {
      expect(out.droppedParagraphs).toBe(1);
      expect(JSON.stringify(out.reply)).not.toMatch(/987/);
    }
    const clean = await runAdvisor(sent, good, "m");
    expect(clean.status === "ok" && clean.droppedParagraphs).toBeUndefined();
  });

  it("passes the time left to the model caller, and it stays within the budget", async () => {
    let seen: number | undefined;
    await runAdvisor(sent, async (req) => { seen = req.remainingMs; return { text: reply() }; }, "m");
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThanOrEqual(MODEL_BUDGET_MS);
    expect(MODEL_BUDGET_MS).toBeLessThan(60_000);
  });

  it("no repair attempt when the first one used up the time", async () => {
    let t = 0;
    const clock = () => new Date((t += 30_000));
    let n = 0;
    const out = await runAdvisor(sent, async () => { n++; return { text: reply({ text: "Short in 987 of 40 seasons." }) }; }, "m", clock);
    expect(out.status).toBe("rejected");
    expect(n).toBe(1);
    if (out.status === "rejected") expect(out.message).toMatch(/no time left/);
  });

  it("maps model errors without inventing text", async () => {
    const out = await runAdvisor(sent, async () => { throw new ModelError("rate-limited", "limit"); }, "m");
    expect(out).toEqual({ status: "error", kind: "rate-limited", message: "limit" });
    const out2 = await runAdvisor(sent, async () => { throw new Error("boom"); }, "m");
    expect(out2.status).toBe("error");
  });

  it("sends the trimmed payload and system prompt, and no key", async () => {
    let seen = "";
    await runAdvisor(sent, async (req) => { seen = req.system + req.user; return { text: "{}" }; }, "m");
    expect(seen).toMatch(/strict/);
    expect(seen).not.toMatch(/API_KEY|AIza/);
    expect(seen).toContain("Brentwood, CA");
  });
});

describe("validateRequest", () => {
  it("accepts a good request", () => {
    expect(validateRequest(REQ).ok).toBe(true);
  });
  it("rejects bad coordinates, unknown crops, negative yields, negative supply and too many rotations", () => {
    expect(validateRequest({ ...REQ, lat: 200 }).ok).toBe(false);
    expect(validateRequest({ ...REQ, rotations: [{ name: "a", sequence: ["alfalfa"] }] }).ok).toBe(false);
    expect(validateRequest({ ...REQ, yields: { cotton: -1 } }).ok).toBe(false);
    expect(validateRequest({ ...REQ, yields: { nope: 1 } }).ok).toBe(false);
    expect(validateRequest({ ...REQ, supplyMm: -5 }).ok).toBe(false);
    expect(validateRequest({ ...REQ, rotations: Array(4).fill(REQ.rotations[0]) }).ok).toBe(false);
    expect(validateRequest(null).ok).toBe(false);
  });
  it("drops unknown priorities and a bad price instead of passing them on", () => {
    const v = validateRequest({ ...REQ, priorities: ["use-less-water", "get-rich"], price: { units: "us", waterPrice: -3 } });
    expect(v.ok && v.req.priorities).toEqual(["use-less-water"]);
    expect(v.ok && v.req.price).toBeUndefined();
  });
});

function leafStrings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === "string") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => leafStrings(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) leafStrings(x, path ? `${path}.${k}` : k, out);
  return out;
}

describe("the data package's own wording passes the check when quoted with its path", () => {
  it("every string in what is sent (limits, notes, quotes, labels, rotation names) is acceptable when copied word for word and cited", () => {
    const leaves = leafStrings(sent, "").filter(([p, t]) => (p.includes(".") || p.endsWith("]")) && t.trim().length > 0);
    expect(leaves.length).toBeGreaterThan(30);
    const failures: string[] = [];
    for (const [path, text] of leaves) {
      const raw = JSON.stringify({ sections: [{ id: "plan", heading: "Plan", paragraphs: [{ text, facts: [path] }] }], notAvailable: unavailableSections(sent) });
      const r = checkReply(raw, sent);
      if (!r.ok) failures.push(`${path}: ${r.reasons[0]}`);
    }
    expect(failures).toEqual([]);
  });

  it("a made-up sentence containing a banned word still fails even when it cites a path with other text", () => {
    const r = checkReply(reply({ text: "This rotation will earn more profit.", facts: ["limits[0]"] }), sent);
    expect(r.ok).toBe(false);
  });
});

describe("rotation names are replaced before anything is sent", () => {
  it("uses letters and crop names, never the typed name or its digits", () => {
    const { renamed, key } = anonymizeRotations([
      { name: "Rotation 1", sequence: ["winter-wheat", "maize-grain"] },
      { name: "Dad's 2024 plan", sequence: ["cotton"] },
    ]);
    expect(renamed[0].name).toBe("Rotation A (Winter wheat, then Maize (grain corn))");
    expect(renamed[1].name).toMatch(/^Rotation B \(Cotton/);
    expect(JSON.stringify(renamed)).not.toMatch(/Dad|2024/);
    expect(key[1]).toContain("Dad's 2024 plan");
  });
  it("the payload sent has the letter names and not what the farmer typed", async () => {
    const b = await buildAdvisorRequestPayload({ ...REQ, rotations: [{ name: "Secret name 77", sequence: ["winter-wheat"] }, { name: "Other 88", sequence: ["cotton"] }] });
    if ("error" in b) throw new Error(b.error);
    const text = JSON.stringify(forModel(b.payload, b.placeName));
    expect(text).not.toMatch(/Secret name|Other 88/);
    expect(text).toContain("Rotation A (Winter wheat)");
    expect(b.rotationKey[0]).toContain("Secret name 77");
  });
});

describe("one rotation", () => {
  it("is accepted end to end: the payload has just that rotation, no ranking, and says there is nothing to compare", async () => {
    const one = { ...REQ, rotations: [REQ.rotations[0]] };
    expect(validateRequest(one).ok).toBe(true);
    const b = await buildAdvisorRequestPayload(one);
    if ("error" in b) throw new Error(b.error);
    const p = forModel(b.payload, b.placeName);
    if (p.water.status !== "ok" || sent.water.status !== "ok") throw new Error("water");
    expect(p.water.rotations).toHaveLength(1);
    // Same figures as when it is replayed next to another rotation: nothing from the stand-in leaks in.
    expect(p.water.rotations[0]).toEqual(sent.water.rotations[0]);
    expect(JSON.stringify(p)).not.toMatch(/stand-in/);
    expect(p.nutrients.rotations).toHaveLength(1);
    for (const v of Object.values(p.nutrients.orderedByRemoval)) expect(v).toEqual({ comparable: false, names: [] });
    expect(p.priorities.length).toBeGreaterThan(0);
    for (const pr of p.priorities) {
      expect(pr.best).toEqual([]);
      expect(pr.comparable).toBe(false);
    }
    expect(p.limits.join(" ")).toMatch(/nothing to compare/);
    expect(b.rotationKey).toHaveLength(1);
  });

  it("a what-if on one rotation keeps only that rotation", async () => {
    const b = await buildAdvisorRequestPayload({ ...REQ, rotations: [REQ.rotations[0]], scenario: { rainFactor: 0.8, tempDeltaC: 1, humidity: "hold-vapour-pressure" } });
    if ("error" in b) throw new Error(b.error);
    if (b.payload.scenario.status !== "ok") throw new Error(b.payload.scenario.status);
    expect(b.payload.scenario.rotations).toHaveLength(1);
    expect(JSON.stringify(b.payload)).not.toMatch(/stand-in/);
  });
});
