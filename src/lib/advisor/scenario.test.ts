import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "../../app/api/scenario/route";
import { usableCrops } from "../crops/catalog";
import { loadSavedDemoPin } from "../power";
import { replay } from "../replay/replay";
import type { ReplayOk } from "../replay/types";
import { runScenarioReplay, SCENARIO_LABEL } from "../scenario";
import type { PowerResult } from "../types";
import { checkReply, unavailableSections } from "./guard";
import { forModel, MODEL_SYSTEM_PROMPT } from "./model";
import { buildScenarioView } from "./scenarioView";
import { anonymizeRotations, buildAdvisorRequestPayload, buildScenarioResponse, validateRequest, validateScenarioSettings } from "./server";
import type { AdvisorRequest } from "./server";

// Real saved Brentwood record. The rotations, supply and yields are test inputs standing in for what a farmer would choose.
const BASE: AdvisorRequest = {
  lat: 37.93,
  lon: -121.66,
  exampleFarm: true,
  rotations: [
    { name: "Rotation 1", sequence: ["winter-wheat", "maize-grain"] },
    { name: "Rotation 2", sequence: ["maize-grain", "cotton"] },
  ],
  supplyMm: 700,
  yields: { "winter-wheat": 60, "maize-grain": 150, cotton: 2 },
  priorities: ["dependable-water"],
};

let power: PowerResult;
beforeAll(async () => {
  power = await loadSavedDemoPin("brentwood");
});

describe("validateScenarioSettings", () => {
  it("accepts the slider range edges and fills in the default humidity", () => {
    for (const [r, t] of [[0.7, -2], [1.3, 4], [1, 0], [0.85, 1.5]] as const) {
      const v = validateScenarioSettings({ rainFactor: r, tempDeltaC: t });
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.scenario?.humidity).toBe("hold-vapour-pressure");
    }
  });
  it("rejects values outside the page's ranges, non-numbers and unknown humidity options", () => {
    for (const bad of [
      { rainFactor: 0.5, tempDeltaC: 0 },
      { rainFactor: 1.4, tempDeltaC: 0 },
      { rainFactor: 1, tempDeltaC: -3 },
      { rainFactor: 1, tempDeltaC: 5 },
      { rainFactor: "x", tempDeltaC: 0 },
      { rainFactor: 1, tempDeltaC: Number.NaN },
      { rainFactor: 1, tempDeltaC: 0, humidity: "fog" },
    ])
      expect(validateScenarioSettings(bad).ok, JSON.stringify(bad)).toBe(false);
  });
  it("treats absent settings as none", () => {
    expect(validateScenarioSettings(undefined)).toEqual({ ok: true, scenario: undefined });
  });
});

describe("validateRequest with a scenario", () => {
  it("keeps a real what-if and drops a neutral one", () => {
    const a = validateRequest({ ...BASE, scenario: { rainFactor: 0.8, tempDeltaC: 2 } });
    expect(a.ok && a.req.scenario).toEqual({ rainFactor: 0.8, tempDeltaC: 2, humidity: "hold-vapour-pressure" });
    const b = validateRequest({ ...BASE, scenario: { rainFactor: 1, tempDeltaC: 0 } });
    expect(b.ok && b.req.scenario).toBeUndefined();
  });
  it("rejects an out-of-range what-if", () => {
    expect(validateRequest({ ...BASE, scenario: { rainFactor: 3, tempDeltaC: 0 } }).ok).toBe(false);
  });
});

describe("what-if response (real saved Brentwood)", () => {
  it("neutral settings reproduce the normal replay exactly", async () => {
    const out = await buildScenarioResponse(BASE);
    if (out.status !== "ok") throw new Error(JSON.stringify(out));
    expect(out.isIdentity).toBe(true);
    for (const r of out.rotations) {
      expect(r.scenario).toEqual(r.baseline);
      expect(r.sentence).toMatch(/was short of water in/);
    }
    // and the baseline is the very same replay the page shows
    const direct = replay(power, usableCrops(), { rotations: BASE.rotations, supplyMm: 700 }) as ReplayOk;
    expect(out.rotations.map((r) => r.baseline.short)).toEqual(direct.rotations.map((r) => r.totals.short));
  });

  it("a drier, hotter what-if equals the engine's own scenario run and says what-if, not forecast", async () => {
    const req = { ...BASE, scenario: { rainFactor: 0.8, tempDeltaC: 2, humidity: "hold-vapour-pressure" as const } };
    const out = await buildScenarioResponse(req);
    if (out.status !== "ok") throw new Error(JSON.stringify(out));
    const direct = runScenarioReplay(power, usableCrops(), { rotations: BASE.rotations, supplyMm: 700, scenario: req.scenario }).replay as ReplayOk;
    expect(out.rotations.map((r) => r.scenario.short)).toEqual(direct.rotations.map((r) => r.totals.short));
    expect(out.label).toBe(SCENARIO_LABEL);
    expect(out.isIdentity).toBe(false);
    expect(out.rotations[0].sentence).toMatch(/20% less rain and 2 °C hotter/);
    expect(out.notes.join(" ")).toMatch(/not a forecast/);
    // drier and hotter cannot reduce the seasons short for these rotations on this record
    out.rotations.forEach((r) => expect(r.scenario.short).toBeGreaterThanOrEqual(r.baseline.short));
  });

  it("cooler settings carry the honest caveat and the real clamped-day count", async () => {
    const out = await buildScenarioResponse({ ...BASE, scenario: { rainFactor: 1, tempDeltaC: -2, humidity: "hold-vapour-pressure" } });
    if (out.status !== "ok") throw new Error(JSON.stringify(out));
    expect(out.rhClampedDays).toBeGreaterThan(0);
    expect(out.caveats.join(" ")).toMatch(/cooler settings are the least faithful/);
    expect(out.caveats.join(" ")).toContain(`${out.rhClampedDays} days`);
  });

  it("holding relative humidity clamps no days, and a rain-only change adds no temperature caveat", async () => {
    const hot = await buildScenarioResponse({ ...BASE, scenario: { rainFactor: 1, tempDeltaC: -2, humidity: "hold-rh" } });
    if (hot.status !== "ok") throw new Error();
    expect(hot.rhClampedDays).toBe(0);
    const rain = await buildScenarioResponse({ ...BASE, scenario: { rainFactor: 0.9, tempDeltaC: 0, humidity: "hold-vapour-pressure" } });
    if (rain.status !== "ok") throw new Error();
    expect(rain.caveats.join(" ")).not.toMatch(/cooler/);
  });

  it("an unusable replay (one rotation) is reported, not invented", async () => {
    const out = await buildScenarioResponse({ ...BASE, rotations: [BASE.rotations[0]] });
    expect(out.status).toBe("error");
  });
});

describe("POST /api/scenario", () => {
  const post = (body: unknown) => POST(new Request("http://x/api/scenario", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("answers a valid request with the side-by-side result", async () => {
    const res = await post({ ...BASE, scenario: { rainFactor: 0.9, tempDeltaC: 0, humidity: "hold-vapour-pressure" } });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.status).toBe("ok");
    expect(j.rotations).toHaveLength(2);
    expect(j.rotations[0].name).toBe("Rotation 1");
  });
  it("rejects bad JSON, bad coordinates, out-of-range settings and oversized bodies", async () => {
    expect((await post("nope")).status).toBe(400);
    expect((await post({ ...BASE, lat: 500, exampleFarm: false })).status).toBe(400);
    expect((await post({ ...BASE, scenario: { rainFactor: 9, tempDeltaC: 0 } })).status).toBe(400);
    expect((await post("x".repeat(30_000))).status).toBe(413);
  });
  it("never needs or exposes a key", async () => {
    const text = await (await post(BASE)).text();
    expect(text).not.toMatch(/API_KEY|AIza|sk-/);
  });
});

describe("what-if in the AI payload (real saved Brentwood)", () => {
  async function payloadFor(scenario: AdvisorRequest["scenario"]) {
    const b = await buildAdvisorRequestPayload({ ...BASE, scenario });
    if ("error" in b) throw new Error(b.error);
    return forModel(b.payload, b.placeName);
  }

  it("carries baseline and what-if counts, the label, settings, sentences and caveats", async () => {
    const p = await payloadFor({ rainFactor: 0.8, tempDeltaC: 2, humidity: "hold-vapour-pressure" });
    if (p.scenario.status !== "ok") throw new Error(JSON.stringify(p.scenario));
    const direct = runScenarioReplay(power, usableCrops(), { rotations: anonymizeRotations(BASE.rotations).renamed, supplyMm: 700, scenario: { rainFactor: 0.8, tempDeltaC: 2 } }).replay as ReplayOk;
    expect(p.scenario.label).toBe(SCENARIO_LABEL);
    expect(p.scenario.rainFactor).toBe(0.8);
    expect(p.scenario.tempDeltaC).toBe(2);
    expect(p.scenario.rotations.map((r) => r.scenarioSeasonsShort)).toEqual(direct.rotations.map((r) => r.totals.short));
    // the same baseline numbers as the water section
    if (p.water.status !== "ok") throw new Error();
    expect(p.scenario.rotations.map((r) => r.baselineSeasonsShort)).toEqual(p.water.rotations.map((r) => r.seasonsShort));
    expect(p.scenario.rotations[0].byDecade).toHaveLength(4);
    expect(p.scenario.rotations[0].sentence).toMatch(/20% less rain and 2 °C hotter/);
    // letter names stay, and the sentence names crops, not what the farmer typed
    expect(p.scenario.rotations[0].name).toMatch(/^Rotation A/);
    expect(JSON.stringify(p.scenario)).not.toMatch(/Rotation 1/);
    expect(p.limits.join(" ")).toMatch(/Describe it only as a what-if/);
  });

  it("a neutral or absent what-if adds nothing to describe", async () => {
    for (const s of [undefined, { rainFactor: 1, tempDeltaC: 0 }]) {
      const p = await payloadFor(s);
      expect(p.scenario.status).toBe("not-applied");
      expect(JSON.stringify(p.scenario)).not.toMatch(/baselineSeasonsShort|scenarioSeasonsShort/);
      expect(p.limits.join(" ")).not.toMatch(/Describe it only as a what-if/);
    }
  });

  it("every string in the what-if section passes the reply check when quoted with its path", async () => {
    const p = await payloadFor({ rainFactor: 0.8, tempDeltaC: -2, humidity: "hold-vapour-pressure" });
    const leaves: [string, string][] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") leaves.push([path, v]);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(p.scenario, "scenario");
    expect(leaves.length).toBeGreaterThan(6);
    const failures: string[] = [];
    for (const [path, text] of leaves) {
      const raw = JSON.stringify({ sections: [{ id: "water", heading: "What if", paragraphs: [{ text, facts: [path] }] }], notAvailable: unavailableSections(p) });
      const r = checkReply(raw, p);
      if (!r.ok) failures.push(`${path}: ${r.reasons[0]}`);
    }
    expect(failures).toEqual([]);
  });

  it("a made-up what-if figure is rejected, a real one is accepted", async () => {
    const p = await payloadFor({ rainFactor: 0.8, tempDeltaC: 2, humidity: "hold-vapour-pressure" });
    if (p.scenario.status !== "ok") throw new Error();
    const real = p.scenario.rotations[0].scenarioSeasonsShort;
    const mk = (n: number) =>
      JSON.stringify({
        sections: [{ id: "water", heading: "What if", paragraphs: [{ text: `As a what-if applied to the real record, not a forecast, it would have been short in ${n} seasons.`, facts: ["scenario.rotations[0].scenarioSeasonsShort"] }] }],
        notAvailable: unavailableSections(p),
      });
    expect(checkReply(mk(real), p).ok).toBe(true);
    expect(checkReply(mk(real === 31 ? 32 : 31), p).ok).toBe(false);
  });

  it("the prompt tells the model to describe a what-if only from the scenario section and never as a forecast", () => {
    expect(MODEL_SYSTEM_PROMPT).toMatch(/scenario section/);
    expect(MODEL_SYSTEM_PROMPT).toMatch(/not a forecast/);
    expect(MODEL_SYSTEM_PROMPT).toMatch(/not-applied/);
  });
});

describe("buildScenarioView", () => {
  it("returns unavailable (with the reason) when either replay cannot run", () => {
    const bad = { status: "unavailable" as const, cause: "invalid-input" as const, reason: "Nope.", problems: [], nextStep: "Fix it." };
    const run = runScenarioReplay(power, usableCrops(), { rotations: BASE.rotations, supplyMm: 700, scenario: { rainFactor: 0.9, tempDeltaC: 0 } });
    expect(buildScenarioView(bad, run, { rainFactor: 0.9, tempDeltaC: 0 }).status).toBe("unavailable");
  });
});
