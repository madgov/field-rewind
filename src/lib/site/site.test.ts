import fs from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FindingsView from "@/components/site/FindingsView";
import GlossaryList from "@/components/site/GlossaryList";
import SatelliteView from "@/components/site/SatelliteView";
import SiteShell from "@/components/site/SiteShell";
import { SITE_LINKS } from "@/components/site/links";
import glossaryJson from "../../../data/site/glossary.json";
import satelliteJson from "../../../data/site/satellite-vs-ground.json";
import { loadFindings } from "./findings";
import { loadGlossary } from "./glossary";
import { resolveCites } from "./resolve";
import { loadSatelliteVsGround } from "./satellite";
import type { Cite, GlossaryFile, SatelliteFile } from "./types";

const ROOT = process.cwd();

/** Every app route that has a page.tsx under src/app, as "/x/y". */
function appRoutes(dir = path.join(ROOT, "src", "app"), base = ""): string[] {
  const out: string[] = [];
  if (fs.existsSync(path.join(dir, "page.tsx"))) out.push(base === "" ? "/" : base);
  for (const e of fs.readdirSync(dir, { withFileTypes: true }))
    if (e.isDirectory() && !e.name.startsWith("_") && e.name !== "api") out.push(...appRoutes(path.join(dir, e.name), `${base}/${e.name}`));
  return out;
}
const ROUTES = new Set(appRoutes());
const hrefPath = (href: string) => href.split("#")[0].split("?")[0];

const GLOSS = glossaryJson as unknown as GlossaryFile;
const SAT = satelliteJson as unknown as SatelliteFile;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkCites(owner: string, cites: Cite[], sources: GlossaryFile["sources"]) {
  expect(cites.length, `${owner} needs at least one source`).toBeGreaterThan(0);
  for (const c of cites) {
    expect(c.where.trim().length, `${owner} cite needs 'where'`).toBeGreaterThan(3);
    if (c.kind === "web") {
      const s = sources[c.source];
      expect(s, `${owner}: source ${c.source}`).toBeDefined();
      expect(s.url, `${owner}: ${c.source} url`).toMatch(/^https:\/\//);
      expect(s.readOn, `${owner}: ${c.source} readOn`).toMatch(DATE);
      expect(s.title.length).toBeGreaterThan(3);
      expect(c.quote.trim().length, `${owner}: quote`).toBeGreaterThan(15);
      expect(c.quote.length, `${owner}: quote is short`).toBeLessThan(600);
    } else {
      expect(fs.existsSync(path.join(ROOT, c.path)), `${owner}: repo file ${c.path} exists`).toBe(true);
    }
  }
}

describe("site routes helper", () => {
  it("finds the pages, including the two new ones", () => {
    for (const r of ["/", "/shift", "/replay", "/conditions", "/glossary", "/satellite-vs-ground"]) expect(ROUTES.has(r), r).toBe(true);
  });
  it("SITE_LINKS point at real routes", () => {
    for (const l of SITE_LINKS) expect(ROUTES.has(hrefPath(l.href)), l.href).toBe(true);
  });
});

describe("glossary data", () => {
  const g = loadGlossary();
  it("has unique ids, known groups and no empty text", () => {
    const ids = GLOSS.terms.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(g.terms.length).toBeGreaterThanOrEqual(30);
    for (const t of GLOSS.terms) {
      expect(t.term.trim().length, t.id).toBeGreaterThan(2);
      expect(t.plain.trim().length, `${t.id} plain`).toBeGreaterThan(40);
      expect(t.notTell.trim().length, `${t.id} notTell`).toBeGreaterThan(20);
      expect(GLOSS.groups.some((x) => x.id === t.group), `${t.id} group`).toBe(true);
    }
    for (const grp of g.groups) expect(grp.terms.length, grp.id).toBeGreaterThan(0);
  });
  it("every term is sourced: outside terms by a web document, app terms by the repo's method documents", () => {
    for (const t of GLOSS.terms) {
      checkCites(`term ${t.id}`, t.cites, GLOSS.sources);
      if (t.kind === "world") expect(t.cites.some((c) => c.kind === "web"), `${t.id} needs a web source`).toBe(true);
      else expect(t.cites.some((c) => c.kind === "repo"), `${t.id} needs a repo source`).toBe(true);
    }
  });
  it("every link from a term goes to a real page", () => {
    for (const t of GLOSS.terms) for (const l of t.appLinks) expect(ROUTES.has(hrefPath(l.href)), `${t.id} -> ${l.href}`).toBe(true);
  });
  it("has no hard-coded findings or forecasts in the definitions", () => {
    for (const t of GLOSS.terms) {
      expect(`${t.plain} ${t.notTell}`, t.id).not.toMatch(/\bwill (be|rise|fall|increase|decrease)\b|\bforecast(s|ed)? (that|shows)\b/i);
    }
  });
  it("includes the terms a farmer meets in the app", () => {
    const ids = new Set(GLOSS.terms.map((t) => t.id));
    for (const id of ["regional-climate", "reanalysis", "nasa-power", "et0", "crop-coefficient", "effective-rain", "short-of-water", "replay", "what-if", "ndvi", "ssurgo", "nasadem", "kf-erodibility", "available-water-capacity", "hydrologic-soil-group", "daymet", "cdl", "nlcd", "nutrient-removal", "nitrogen-fixation", "leaching"])
      expect(ids.has(id), id).toBe(true);
  });
  it("says replenishment is unknown, not zero", () => {
    const t = GLOSS.terms.find((x) => x.id === "nitrogen-fixation")!;
    expect(t.appFact).toMatch(/unknown/);
    expect(t.appFact).toMatch(/never assumes zero/);
  });
  it("the Cropland Data Layer entry states the 10 m change and the app's 30 m sampling", () => {
    const t = GLOSS.terms.find((x) => x.id === "cdl")!;
    expect(t.plain).toMatch(/10 m from 2024/);
    expect(t.appFact).toMatch(/30 m/);
  });
});

describe("resolveCites", () => {
  it("throws on an unknown source id instead of hiding it", () => {
    expect(() => resolveCites([{ kind: "web", source: "nope", where: "x", quote: "y" }], GLOSS.sources, "t")).toThrow(/unknown source/);
  });
});

describe("satellite-vs-ground data", () => {
  const d = loadSatelliteVsGround();
  it("has unique layers, valid sides and statuses, and every layer sourced", () => {
    const ids = SAT.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sideIds = new Set(SAT.sides.map((s) => s.id));
    for (const l of SAT.layers) {
      expect(sideIds.has(l.side), l.id).toBe(true);
      expect(["connected", "built-not-run", "not-connected"]).toContain(l.status);
      for (const k of ["plain", "resolution", "coverage", "canSay", "cannotSay", "statusText"] as const) expect(l[k].trim().length, `${l.id}.${k}`).toBeGreaterThan(3);
      checkCites(`layer ${l.id}`, l.cites, SAT.sources);
      expect(l.cites.some((c) => c.kind === "web"), `${l.id} web source`).toBe(true);
      for (const k of l.links) expect(ROUTES.has(hrefPath(k.href)), `${l.id} -> ${k.href}`).toBe(true);
    }
    expect(d.sides.reduce((n, s) => n + s.layers.length, 0)).toBe(d.layers.length);
  });
  it("covers every layer the app really uses, and the two built-but-never-run layers", () => {
    const ids = new Set(SAT.layers.map((l) => l.id));
    for (const id of ["power", "landsat-ndvi", "modis-ndvi", "nasadem", "ssurgo", "daymet", "cdl", "nlcd", "cocorahs", "usgs-wells", "cimis", "openet"]) expect(ids.has(id), id).toBe(true);
    for (const id of ["cimis", "openet"]) {
      const l = SAT.layers.find((x) => x.id === id)!;
      expect(l.status).toBe("built-not-run");
      expect(l.statusText).toMatch(/never run/);
      expect(l.statusText).toMatch(/no .* key/i);
    }
  });
  it("shows the four NASA layers as not connected, with the reason, and describes none of them as used", () => {
    for (const id of ["smap", "imerg", "ecostress", "gldas"]) {
      const l = SAT.layers.find((x) => x.id === id)!;
      expect(l.status, id).toBe("not-connected");
      expect(l.side).toBe("not-connected");
      expect(l.statusText).toMatch(/Earthdata account and an access token/);
      expect(l.statusText).toMatch(/nothing is estimated/);
      expect(l.canSay).toBe("Not used by this app.");
      expect(l.links.length).toBeLessThanOrEqual(1);
    }
  });
  it("the connected layers never claim a status the repo documents contradict", () => {
    expect(SAT.layers.find((l) => l.id === "cimis")!.cannotSay).toMatch(/never been run/);
    expect(SAT.layers.find((l) => l.id === "openet")!.statusText).toMatch(/no OpenET number appears/);
    expect(SAT.layers.find((l) => l.id === "cdl")!.resolution).toMatch(/10 m from 2024/);
  });
  it("lists its gaps", () => {
    expect(d.gaps.length).toBeGreaterThan(5);
    expect(d.gaps.join(" ")).toMatch(/OpenET/);
    expect(d.gaps.join(" ")).toMatch(/reanalysis/);
  });
  it("both-sides statements are sourced", () => {
    expect(SAT.bothSides.length).toBe(3);
    for (const b of SAT.bothSides) checkCites(`bothSides ${b.title}`, b.cites, SAT.sources);
  });
});

describe("source registry", () => {
  it("is the same for both pages, with https urls, one read date and no duplicate urls", () => {
    const all = { ...GLOSS.sources, ...SAT.sources };
    const urls = Object.values(all).map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const s of Object.values(all)) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.readOn).toBe(GLOSS.compiledOn);
    }
    expect(SAT.compiledOn).toBe(GLOSS.compiledOn);
  });
});

describe("findings from the saved responses", () => {
  it("builds real, finite figures for Brentwood and Fresno and says why Ludhiana has none", async () => {
    const f = await loadFindings();
    expect(f.rain.map((r) => r.pinId)).toEqual(["brentwood", "fresno", "ludhiana"]);
    for (const id of ["brentwood", "fresno"]) {
      const r = f.rain.find((x) => x.pinId === id)!;
      expect(r.status).toBe("ok");
      expect(Number.isFinite(r.annual!.powerMm) && Number.isFinite(r.annual!.daymetMm) && Number.isFinite(r.annual!.diffMm)).toBe(true);
      expect(r.annual!.years).toBe(40);
      expect(r.labels.join(" ")).toMatch(/Saved response from/);
      expect(r.gaugeLines.length).toBeGreaterThan(2);
    }
    const lud = f.rain.find((x) => x.pinId === "ludhiana")!;
    expect(lud.status).toBe("none");
    expect(lud.message).toMatch(/North America/);
  });
  it("the three layers agree with each other at Fresno and Brentwood in the way the saved data says", async () => {
    const f = await loadFindings();
    const fresno = f.land.find((x) => x.pinId === "fresno")!;
    expect(fresno.nlcdLine).toMatch(/Developed/);
    expect(fresno.nlcdLabel).toMatch(/MRLC|NLCD|National Land Cover/i);
    expect(fresno.cdlLabel).toMatch(/Cropland Data Layer/);
    expect(fresno.nlcdLabel).toMatch(/Saved response from/);
    const fg = f.greenness.find((x) => x.pinId === "fresno")!;
    const bg = f.greenness.find((x) => x.pinId === "brentwood")!;
    expect(bg.typicalPeak!).toBeGreaterThan(fg.typicalPeak!);
    expect(fg.originLine).toMatch(/Saved response from/);
  });
  it("contains no NaN or undefined text anywhere", async () => {
    const f = await loadFindings();
    expect(JSON.stringify(f)).not.toMatch(/NaN|undefined/);
  });
});

describe("render", () => {
  it("the glossary renders every term with its sources and no broken text", () => {
    const g = loadGlossary();
    const html = renderToStaticMarkup(h(GlossaryList, { glossary: g }));
    for (const t of g.terms) expect(html).toContain(`id="${t.id}"`);
    expect(html).toContain("What it does not tell you");
    expect(html).toContain("Where this comes from");
    expect(html).not.toMatch(/NaN|undefined|\[object/);
  });
  it("the satellite page lists not-connected layers as not connected and cites sources", async () => {
    const d = loadSatelliteVsGround();
    const html = renderToStaticMarkup(h(SatelliteView, { data: d }));
    expect(html).toContain("Not connected");
    expect(html).toContain("Built, never run (no key)");
    expect(html).toContain("What we could not source or check");
    expect(html).toContain('id="smap"');
    expect(html).not.toMatch(/NaN|undefined|\[object/);
  });
  it("the findings block carries its saved-response labels and the framing sentence", async () => {
    const html = renderToStaticMarkup(h(FindingsView, { f: await loadFindings() }));
    expect(html).toContain("Saved response from");
    expect(html).toContain("two gridded products");
    expect(html).toContain("Nothing to compare");
    expect(html).not.toMatch(/NaN|undefined|\[object/);
  });
  it("the shell has one h1, a way back to the map and a footer", () => {
    const html = renderToStaticMarkup(h(SiteShell, { kicker: "k", title: "Title here", sub: "sub", chips: ["a", "b"], currentHref: "/glossary", children: h("p", null, "body") }));
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("Back to the map");
    expect(html).toContain("<footer");
    expect(html).toContain("/satellite-vs-ground");
    expect(html).not.toContain('href="/glossary"');
  });
});
