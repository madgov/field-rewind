import { describe, expect, it } from "vitest";
import { describeSeason, displayedFigures, rotationHeadline, rotationSentence } from "./wording";
import type { DecadeCount, SeasonResult } from "./types";

function dec(label: string, short: number, evaluable: number): DecadeCount {
  return { label, startYear: 0, endYear: 0, seasons: 10, short, ok: evaluable - short, insufficient: 10 - evaluable, evaluable };
}
const FIRST = "1986–1995";
const LAST = "2016–2025";

describe("rotation headline and sentence", () => {
  it("matches the documented shape", () => {
    expect(rotationHeadline(dec(FIRST, 2, 10), dec(LAST, 6, 10))).toBe(
      "Short on water in 2 of 10 seasons in 1986–1995, and 6 of 10 in 2016–2025",
    );
  });

  it("agrees with the counts across a grid of combinations, never shows a sign before a digit, and makes no causal claim", () => {
    let combos = 0;
    for (const ea of [10, 9, 7, 1, 0]) {
      for (const eb of [10, 9, 7, 1, 0]) {
        for (let a = 0; a <= ea; a++) {
          for (let b = 0; b <= eb; b++) {
            combos++;
            const f = dec(FIRST, a, ea);
            const l = dec(LAST, b, eb);
            const h = rotationHeadline(f, l);
            const s = rotationSentence(f, l);
            const all = `${h} ${s}`;
            expect(all).not.toMatch(/[+\-−]\s?\d/);
            expect(all).not.toMatch(/\b(caused|because of the climate|due to|driven by|trend|clear change)\b/i);
            expect(all).not.toMatch(/NaN|undefined|Infinity/);
            if (ea === 0 || eb === 0) {
              expect(h).toMatch(/^Not enough data/);
              expect(s).toMatch(/cannot be compared/);
              continue;
            }
            expect(h).toContain(`${a} of`);
            expect(h).toContain(`${b} of`);
            expect(h).toContain(FIRST);
            expect(h).toContain(LAST);
            if (ea === eb) {
              if (a === 0 && b === 0) expect(s).toMatch(/never short|None of the seasons/);
              else if (a === b) expect(s).toMatch(/same number .* no change/);
              else if (b > a) expect(s).toContain(`${b - a} more short season`);
              else expect(s).toContain(`${a - b} fewer short season`);
              if (b > a) expect(s).not.toMatch(/fewer|no change/);
              if (b < a) expect(s).not.toMatch(/more short|no change/);
            } else {
              const lhs = b * ea;
              const rhs = a * eb;
              if (lhs > rhs) expect(s).toMatch(/larger share was short in 2016–2025/);
              else if (lhs < rhs) expect(s).toMatch(/smaller share was short in 2016–2025/);
              else expect(s).toMatch(/no change/);
            }
          }
        }
      }
    }
    expect(combos).toBeGreaterThan(500);
  });

  it("when counts are equal, says there is no change; when both are zero, says it was never short", () => {
    expect(rotationSentence(dec(FIRST, 3, 10), dec(LAST, 3, 10))).toMatch(/same number of short seasons in both decades \(3\), so there is no change/);
    expect(rotationSentence(dec(FIRST, 0, 10), dec(LAST, 0, 10))).toMatch(/never short in either decade, so there is no change/);
  });

  it("singular and plural", () => {
    expect(rotationSentence(dec(FIRST, 2, 10), dec(LAST, 3, 10))).toMatch(/1 more short season in 2016–2025/);
    expect(rotationSentence(dec(FIRST, 5, 10), dec(LAST, 3, 10))).toMatch(/2 fewer short seasons in 2016–2025/);
  });

  it("says how many seasons could be judged when a decade has grey seasons", () => {
    const h = rotationHeadline(dec(FIRST, 2, 9), dec(LAST, 4, 10));
    expect(h).toContain("2 of the 9 seasons that could be judged");
    expect(h).toContain("4 of 10 in 2016–2025");
    const s = rotationSentence(dec(FIRST, 2, 9), dec(LAST, 4, 8));
    expect(s).toContain("In 1986–1995, 1 of 10 seasons could not be judged because of missing weather data.");
    expect(s).toContain("In 2016–2025, 2 of 10 seasons could not be judged because of missing weather data.");
    expect(s).toContain("(9 and 8)");
  });

  it("with no judged season in a decade it says so rather than comparing", () => {
    expect(rotationHeadline(dec(FIRST, 0, 0), dec(LAST, 3, 10))).toBe("Not enough data: no season in 1986–1995 could be judged");
    expect(rotationHeadline(dec(FIRST, 0, 0), dec(LAST, 0, 0))).toContain("1986–1995 or 2016–2025");
  });
});

describe("season sentence", () => {
  const base: SeasonResult = {
    year: 2003, cropId: "x", cropName: "Tomato", status: "evaluated", plantingDate: "2003-04-01", endDate: "2003-08-01",
    lengthDays: 123, etcMm: 700, effectiveRainMm: 88.4, needMm: 611.6, heatDays: 3, heatThresholdC: 35,
    missingEt0Days: 0, missingPrecipSeasonDays: 0, missingPrecipMonthDays: 0, missingTMaxDays: 0,
    supplyMm: 500, outcome: "short", marginMm: -111.6, needFractionOfSupply: 1.22,
  };
  it("short: gap equals the difference of the rounded numbers", () => {
    const t = describeSeason(base);
    expect(t).toContain("needed about 612 mm");
    expect(t).toContain("500 mm was short by 112 mm");
    expect(t).not.toMatch(/[+\-−]\d/);
  });
  it("ok: spare equals the difference of the rounded numbers", () => {
    const t = describeSeason({ ...base, supplyMm: 700, outcome: "ok", marginMm: 88.4 });
    expect(t).toContain("covered it with 88 mm to spare");
  });
  it("just short: need above supply by less than the rounding step", () => {
    const t = describeSeason({ ...base, etcMm: 588.4, effectiveRainMm: 88.1, needMm: 500.3, supplyMm: 500, outcome: "short" });
    expect(t).toContain("just short");
  });
  it("zero need", () => {
    expect(describeSeason({ ...base, etcMm: 80, effectiveRainMm: 90, needMm: 0, outcome: "ok" })).toContain("needed no irrigation water");
  });
  it("grey season", () => {
    expect(describeSeason({ ...base, status: "insufficient-data", outcome: null, needMm: null, reason: "Too many gaps." })).toBe(
      "2003: could not be judged. Too many gaps.",
    );
  });
});

describe("displayed figures add up", () => {
  it("need shown = rounded water use minus rounded rain, floored at 0; may differ from round(unrounded need) by 1", () => {
    // 600.5 -> 601, 200.5 -> 201 (Math.round), unrounded need 400.0 -> would print 400, but shown arithmetic is 601 - 201 = 400 here
    expect(displayedFigures({ etcMm: 600.4, effectiveRainMm: 200.4, needMm: 400 })).toEqual({ etcMm: 600, rainMm: 200, needMm: 400 });
    // unrounded need 400.4 rounds to 400, but 600.5 - 200.1 rounds to 601 - 200 = 401: the shown figures stay consistent with each other
    expect(displayedFigures({ etcMm: 600.5, effectiveRainMm: 200.1, needMm: 400.4 })).toEqual({ etcMm: 601, rainMm: 200, needMm: 401 });
    const f = displayedFigures({ etcMm: 600.5, effectiveRainMm: 200.1, needMm: 400.4 })!;
    expect(f.etcMm - f.rainMm).toBe(f.needMm);
  });
  it("floors at 0 and is null for grey seasons", () => {
    expect(displayedFigures({ etcMm: 80.2, effectiveRainMm: 90.4, needMm: 0 })!.needMm).toBe(0);
    expect(displayedFigures({ etcMm: null, effectiveRainMm: null, needMm: null })).toBeNull();
  });
  it("the caption uses the same need as the gauge list", () => {
    const base: SeasonResult = {
      year: 2003, cropId: "x", cropName: "Tomato", status: "evaluated", plantingDate: "2003-04-01", endDate: "2003-08-01",
      lengthDays: 123, etcMm: 600.5, effectiveRainMm: 200.1, needMm: 400.4, heatDays: 3, heatThresholdC: 35,
      missingEt0Days: 0, missingPrecipSeasonDays: 0, missingPrecipMonthDays: 0, missingTMaxDays: 0,
      supplyMm: 500, outcome: "ok", marginMm: 99.6, needFractionOfSupply: 0.8,
    };
    expect(describeSeason(base)).toContain("needed about 401 mm");
    expect(describeSeason(base)).toContain("99 mm to spare");
  });
});
