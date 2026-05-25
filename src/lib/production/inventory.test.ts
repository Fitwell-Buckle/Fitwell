import { describe, it, expect } from "vitest";
import { aggregateIncoming, type IncomingLine } from "@/lib/production/inventory";
import { DEFAULT_STAGE_DAYS } from "@/lib/production/cycle-time";

const today = "2026-05-24";

function line(overrides: Partial<IncomingLine> = {}): IncomingLine {
  return {
    sku: "FBW001-SS-16",
    title: "Buckle 16mm",
    quantity: 10,
    currentStage: "plating",
    ...overrides,
  };
}

describe("aggregateIncoming", () => {
  it("sums quantity per SKU and breaks it down by stage", () => {
    const rows = aggregateIncoming(
      [
        line({ quantity: 10, currentStage: "plating" }),
        line({ quantity: 5, currentStage: "qc" }),
      ],
      DEFAULT_STAGE_DAYS,
      today,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].incomingQty).toBe(15);
    expect(rows[0].byStage).toEqual({ plating: 10, qc: 5 });
  });

  it("takes the nearest ETA across a SKU's lines", () => {
    const rows = aggregateIncoming(
      [
        line({ currentStage: "packaging" }), // closest
        line({ currentStage: "stamping" }), // further out
      ],
      DEFAULT_STAGE_DAYS,
      today,
    );
    // packaging is 1 day out → 2026-05-25, sooner than stamping's projection.
    expect(rows[0].nearestEta).toBe("2026-05-25");
  });

  it("separates distinct SKUs and sorts by buckle size", () => {
    const rows = aggregateIncoming(
      [
        line({ sku: "FBW001-SS-22", title: "22mm", quantity: 4 }),
        line({ sku: "FBW001-SS-16", title: "16mm", quantity: 7 }),
      ],
      DEFAULT_STAGE_DAYS,
      today,
    );
    expect(rows.map((r) => r.sku)).toEqual(["FBW001-SS-16", "FBW001-SS-22"]);
    expect(rows[0].incomingQty).toBe(7);
  });

  it("returns an empty list for no lines", () => {
    expect(aggregateIncoming([], DEFAULT_STAGE_DAYS, today)).toEqual([]);
  });

  it("a completed (ready-to-receive) line has an ETA of today", () => {
    const rows = aggregateIncoming(
      [line({ currentStage: "complete" })],
      DEFAULT_STAGE_DAYS,
      today,
    );
    expect(rows[0].nearestEta).toBe(today);
  });
});
