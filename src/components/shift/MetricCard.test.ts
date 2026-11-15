import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadSavedDemoPin } from "@/lib/power";
import { computeShift } from "@/lib/shift/compute";
import MetricCard from "./MetricCard";

describe("MetricCard on real saved data", () => {
  it("never says 'strain'; says the factual direction for clear changes; inches come from the printed mm", async () => {
    for (const id of ["brentwood", "fresno", "ludhiana"]) {
      const r = computeShift(await loadSavedDemoPin(id));
      if (r.status !== "ok") throw new Error("expected ok");
      for (const [i, m] of Object.values(r.metrics).entries()) {
        const html = renderToStaticMarkup(h(MetricCard, { metric: m, index: i }));
        expect(html).not.toMatch(/strain/i);
        if (m.verdict === "increase" || m.verdict === "decrease") {
          expect(html).toMatch(/More days over 35|Fewer days over 35|Higher crop water demand|Lower crop water demand|More rain|Less rain/);
        }
        if (m.unit === "mm per year" && (m.verdict === "increase" || m.verdict === "decrease")) {
          const shown = Math.abs(Math.round(m.late.mean!) - Math.round(m.early.mean!));
          const inches = (shown / 25.4).toFixed(1);
          expect(html).toContain(`about ${inches} inches a year`);
        }
      }
    }
  });
});
