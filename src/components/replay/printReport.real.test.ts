// Renders the printed report from the real saved Brentwood record (no fixtures).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CROP_CATALOG, usableCrops } from "@/lib/crops/catalog";
import { cropRegionNotice } from "@/lib/crops/region";
import { DEMO_PINS } from "@/lib/demoPins";
import { loadSavedDemoPin } from "@/lib/power";
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "@/lib/replay/examples";
import { replay } from "@/lib/replay/replay";
import type { ReplayOk } from "@/lib/replay/types";
import { cropAbbreviations } from "./cells";
import PrintReport from "./PrintReport";

async function render(pinId: string, over: { exampleRotations: boolean; exampleSupply: boolean }) {
  const power = await loadSavedDemoPin(pinId);
  const pin = DEMO_PINS.find((p) => p.id === pinId)!;
  const crops = usableCrops();
  const result = replay(power, CROP_CATALOG.crops, { supplyMm: EXAMPLE_SUPPLY_MM, rotations: EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence })) }) as ReplayOk;
  const { days, ...header } = power;
  void days;
  return renderToStaticMarkup(
    h(PrintReport, { result, place: pin.name, gridText: "Grid square", header, abbr: cropAbbreviations(crops), usedCrops: crops, meta: null, region: cropRegionNotice(pin.lat, pin.lon), ...over }),
  );
}

describe("printed report", () => {
  it("Brentwood: saved-response line, 50 km label, catalog region, no outside-California warning", async () => {
    const html = await render("brentwood", { exampleRotations: true, exampleSupply: true });
    expect(html).toMatch(/Saved response from \d{1,2} \w{3} \d{4}/);
    expect(html).toContain("Regional climate, about 50 km grid");
    expect(html).toContain(CROP_CATALOG.region);
    expect(html).not.toContain("print-region-warning");
    expect(html).toContain("The rotations and supply shown are the built-in example.");
    expect(html).toContain("secondary source");
  });
  it("Ludhiana: prints the outside-California warning", async () => {
    const html = await render("ludhiana", { exampleRotations: true, exampleSupply: true });
    expect(html).toContain("print-region-warning");
    expect(html).toContain("may not match local practice");
  });
  it("words the example note per what actually matches", async () => {
    const rotOnly = await render("brentwood", { exampleRotations: true, exampleSupply: false });
    expect(rotOnly).toContain("the water supply was changed");
    expect(rotOnly).not.toContain("rotations and supply shown");
    const none = await render("brentwood", { exampleRotations: false, exampleSupply: false });
    expect(none).not.toContain("built-in example");
  });
});
