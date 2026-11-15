import { describe, expect, it } from "vitest";
import { barGeometry, niceTicks, scatterGeometry } from "./geometry";

describe("niceTicks", () => {
  it("starts at 0 and covers the max in round steps", () => {
    expect(niceTicks(10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(8, 4)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe("scatterGeometry", () => {
  const binned = { binSizeMm: 0.25, cells: [{ x: 0, y: 0, count: 1 }, { x: 2, y: 2.25, count: 100 }], axisMaxMm: 8 };
  const g = scatterGeometry(binned, { slope: 1, intercept: 1 }, 460);
  it("maps the origin to the bottom-left and axisMax to the top-right of the plot", () => {
    expect(g.oneToOne.x1).toBeCloseTo(g.plot.x);
    expect(g.oneToOne.y1).toBeCloseTo(g.plot.y + g.plot.h);
    expect(g.oneToOne.x2).toBeCloseTo(g.plot.x + g.plot.w);
    expect(g.oneToOne.y2).toBeCloseTo(g.plot.y);
  });
  it("shades the busiest cell darkest and keeps single days visible", () => {
    expect(g.cells[1].opacity).toBeCloseTo(1);
    expect(g.cells[0].opacity).toBeGreaterThan(0.1);
  });
  it("clips the regression line to the plot (y = x + 1 leaves the square at x = 7)", () => {
    expect(g.regression).not.toBeNull();
    expect(g.regression!.y2).toBeCloseTo(g.plot.y);
    expect(g.regression!.x2).toBeLessThan(g.plot.x + g.plot.w);
  });
  it("has no regression line when there is no regression", () => {
    expect(scatterGeometry(binned, null).regression).toBeNull();
  });
});

describe("barGeometry", () => {
  it("draws no bar for a null value, and the others stand on the baseline", () => {
    const g = barGeometry([{ label: "a", a: 10, b: null }, { label: "b", a: 5, b: 10 }], { groupWidth: 20 });
    expect(g.groups[0].b).toBeNull();
    const base = g.plot.y + g.plot.h;
    expect(g.groups[0].a!.y + g.groups[0].a!.h).toBeCloseTo(base);
    expect(g.groups[1].a!.h).toBeCloseTo(g.groups[1].b!.h / 2);
    expect(g.width).toBeCloseTo(g.plot.x + 40 + 10);
  });
});
