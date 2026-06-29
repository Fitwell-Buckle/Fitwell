import { describe, it, expect } from "vitest";
import { validateChartSpec } from "./chart";

describe("validateChartSpec", () => {
  it("accepts a valid line spec and coerces string values to numbers", () => {
    const r = validateChartSpec({
      type: "line",
      title: "Revenue by month",
      xKey: "month",
      series: [{ key: "revenue" }],
      data: [
        { month: "Mar", revenue: "1000" },
        { month: "Apr", revenue: 2000 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.data[0]).toEqual({ month: "Mar", revenue: 1000 });
      expect(r.spec.data[1]).toEqual({ month: "Apr", revenue: 2000 });
    }
  });

  it("defaults non-numeric series values to 0", () => {
    const r = validateChartSpec({
      type: "bar",
      xKey: "cat",
      series: [{ key: "n" }],
      data: [{ cat: "a", n: "oops" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.data[0].n).toBe(0);
  });

  it("caps data at 100 points", () => {
    const r = validateChartSpec({
      type: "line",
      xKey: "x",
      series: [{ key: "y" }],
      data: Array.from({ length: 250 }, (_, i) => ({ x: i, y: i })),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.data.length).toBe(100);
  });

  for (const [label, bad] of [
    ["invalid type", { type: "scatter", xKey: "x", series: [{ key: "y" }], data: [{ x: 1, y: 2 }] }],
    ["empty data", { type: "line", xKey: "x", series: [{ key: "y" }], data: [] }],
    ["missing xKey", { type: "line", series: [{ key: "y" }], data: [{ y: 2 }] }],
    ["no series", { type: "line", xKey: "x", series: [], data: [{ x: 1 }] }],
  ] as const) {
    it(`rejects: ${label}`, () => {
      expect(validateChartSpec(bad).ok).toBe(false);
    });
  }
});
