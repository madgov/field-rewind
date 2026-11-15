import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadSavedDemoPin } from "@/lib/power";
import { julyMeanTmax } from "@/lib/summary/julyTmax";
import Caveat50km from "./Caveat50km";

describe("Caveat50km", () => {
  it("prints the Fresno July figure computed from the saved record, with period, station and NOAA link", async () => {
    const j = julyMeanTmax((await loadSavedDemoPin("fresno")).days);
    expect(j.available).toBe(true);
    if (!j.available) return;
    const html = renderToStaticMarkup(await Caveat50km());
    expect(html).toContain(`${j.meanC.toFixed(1)} °C`.replace(" °C", " &deg;C").replace("&deg;", "°"));
    expect(html).toContain(`${j.yearsUsed} Julys, ${j.firstYear} to ${j.lastYear}`);
    expect(html).toContain("FRESNO YOSEMITE INTL AP");
    expect(html).toContain("1991-2020");
    expect(html).toContain("https://www.ncei.noaa.gov/access/services/data/v1?");
    expect(html).toContain("Regional climate, about 50 km grid");
  });
});
