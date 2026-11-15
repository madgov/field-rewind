// Renders the chart components with TEST-ONLY fixtures to check that they produce the expected SVG and text.
// These fixtures never reach the app: the app only ever draws real saved or fetched data.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareSeries } from "@/lib/cimis/compare";
import { compareMonthly } from "@/lib/openet/compare";
import { CimisResultView } from "./CimisSection";
import { CalendarMonthChart, PairedMonthsChart } from "./MonthlyCharts";
import OpenEtSection from "./OpenEtSection";
import ScatterPlot from "./ScatterPlot";
import Example18 from "./Example18";
import OpenEtReplayCompare from "./OpenEtReplayCompare";
import { ReplayRotationsProvider } from "./ReplayInputsContext";
import { buildMonthlyTable } from "@/lib/replay/monthly";
import { fixtureCrop, makeClimate } from "@/lib/replay/testFixtures";

function days(n: number, f: (i: number) => number | null) {
  return Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), value: f(i) }));
}

describe("ScatterPlot", () => {
  const station = days(400, (i) => 2 + (i % 40) / 10);
  const power = days(400, (i) => (i === 7 ? null : 2.3 + (i % 40) / 10));
  const c = compareSeries(station, power);
  const html = renderToStaticMarkup(h(ScatterPlot, { c, id: "t" }));
  it("has an accessible title, description, both axis labels with units, a 1:1 line and a regression line", () => {
    expect(html).toContain('role="img"');
    expect(html).toContain("<title");
    expect(html).toContain("<desc");
    expect(html).toContain("(mm/day)");
    expect(html).toContain("hk-one");
    expect(html).toContain("hk-reg");
    expect((html.match(/hk-dens/g) ?? []).length).toBeGreaterThan(5);
  });
});

describe("CimisResultView", () => {
  const c = compareSeries(days(400, (i) => 2 + (i % 40) / 10), days(400, (i) => 2.3 + (i % 40) / 10));
  const html = renderToStaticMarkup(
    h(CimisResultView, { r: { status: "ok", comparison: c, savedLabel: "saved response from 2026-01-02", fetchedAt: "2026-01-02T00:00:00.000Z", unit: "(mm)", flags: { byFlag: { "(none)": 400 }, nulledByFlag: {}, totalRecords: 400, usable: 400, duplicateDates: 0, otherStation: 0 }, powerFetchedAt: "2026-01-01T00:00:00.000Z" } }),
  );
  it("shows R2, bias, RMSE, ratio, n, the summary, the saved label and the per-year table with non-comparable years marked", () => {
    expect(html).toContain("Saved response from 2026-01-02");
    expect(html).toContain("Not newly retrieved");
    expect(html).toContain("R&sup2;".replace("&sup2;", "²"));
    expect(html).toContain("+0.30 mm/day");
    expect(html).toContain(c.summary.replace(/&/g, "&amp;"));
    expect(html).toContain("Not compared: only");
    expect(html).toContain("400");
  });
});

describe("OpenET charts", () => {
  const obs = Array.from({ length: 24 }, (_, i) => ({ month: `${2010 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, etMm: 20 + i }));
  const mod = obs.map((o, i) => ({ month: o.month, mm: i % 3 === 0 ? null : 30 + i }));
  const cmp = compareMonthly(obs, mod);
  it("renders paired months and calendar months with titles, and no bar for a month with no pair", () => {
    const a = renderToStaticMarkup(h(PairedMonthsChart, { pairs: cmp.pairs, id: "p" }));
    expect(a).toContain("<title");
    expect((a.match(/hk-bar--obs/g) ?? []).length).toBe(cmp.pairs.length + 0);
    const b = renderToStaticMarkup(h(CalendarMonthChart, { months: cmp.byCalendarMonth, id: "c" }));
    expect(b).toContain("n=");
    expect(b).toContain("none");
  });
  it("section with no data shows the exact message and next step and no chart", () => {
    const html = renderToStaticMarkup(
      h(OpenEtSection, { data: { kind: "blocked", status: "no-key", message: "OPENET_API_KEY is not set; the user must create a key", nextStep: "Do the thing." }, mode: "replay", monthlyTable: null }),
    );
    expect(html).toContain("OPENET_API_KEY is not set; the user must create a key");
    expect(html).toContain("Do the thing.");
    expect(html).not.toContain("<svg");
  });
  it("shift-mode section with saved data shows the saved label, the caveat and an observed-only chart", () => {
    const html = renderToStaticMarkup(
      h(OpenEtSection, { data: { kind: "data", observed: obs, originLine: "Saved response from 2026-01-01", isSaved: true, fetchedAt: "2026-01-01T00:00:00.000Z", unitsReported: "mm", range: { first: "2010-01", last: "2011-12", withData: 24, requested: 24 }, provisionalMonths: [], notes: [] }, mode: "shift", monthlyTable: null }),
    );
    expect(html).toContain("Saved response from 2026-01-01");
    expect(html).toContain("Read this first");
    expect(html).not.toContain("Modelled crop water use (this app)");
  });
});

describe("Example18", () => {
  it("renders our result, the published value, the difference and Pass", () => {
    const html = renderToStaticMarkup(h(Example18));
    expect(html).toContain("3.88 mm/day");
    expect(html).toContain("3.9 mm/day");
    expect(html).toContain("Pass");
    expect(html).toContain("x0490e08.htm");
  });
});

describe("OpenEtReplayCompare (follows the rotation on screen)", () => {
  const crop = fixtureCrop({ id: "two", kc: [1, 1, 1], days: [15, 15, 15, 16], plant: "06-01" }); // whole June and July each year
  const table = buildMonthlyTable(makeClimate({ et0: () => 5 }), [crop], 2010, 2011);
  const obs = ["2010-05", "2010-06", "2010-07", "2011-06", "2011-07"].map((month, i) => ({ month, etMm: 100 + i }));
  const rotations = [{ name: "Test rotation", sequence: ["two"], cropNames: ["two"] }];
  it("compares only the whole months the crop grows in, says so, and shows the sentence, caveat and saved label", () => {
    const html = renderToStaticMarkup(h(ReplayRotationsProvider, { value: rotations }, h(OpenEtReplayCompare, { observed: obs, table, savedLabel: "Saved response from 2026-01-01" })));
    expect(html).toContain("Saved response from 2026-01-01");
    expect(html).toContain("Over 4 months (2010-06 to 2011-07)");
    expect(html).toContain("Read this first");
    expect(html).toContain("not treated as zero");
    expect(html).not.toContain("2010-05</th>"); // May has no crop: not in the paired table
  });
});
