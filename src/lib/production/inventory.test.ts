import { describe, it, expect } from "vitest";
import {
  aggregateIncoming,
  aggregateIncomingByPo,
  type IncomingLine,
  type IncomingPoLine,
} from "@/lib/production/inventory";
import { DEFAULT_STAGE_DAYS } from "@/lib/production/cycle-time";
import { STAGES } from "@/lib/production/stages";

const ORDER = [...STAGES];
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
      ORDER,
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
      ORDER,
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
      ORDER,
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
    expect(aggregateIncoming(ORDER, [], DEFAULT_STAGE_DAYS, today)).toEqual([]);
  });

  it("a completed (ready-to-receive) line has an ETA of today", () => {
    const rows = aggregateIncoming(
      ORDER,
      [line({ currentStage: "complete" })],
      DEFAULT_STAGE_DAYS,
      today,
    );
    expect(rows[0].nearestEta).toBe(today);
  });

  it("respects a line's per-line stages subset when projecting ETA", () => {
    // Spring bar skips edm/polishing/logo/plating/qc. A spring-bar line at
    // stamping is much closer to done than a buckle line at stamping that
    // walks the full pipeline. Confirm the subset is the one driving ETA.
    const SPRING = ["supplier_po", "stamping", "packaging", "complete"];
    const fullPipelineRow = aggregateIncoming(
      ORDER,
      [line({ sku: "BUCKLE", currentStage: "stamping" })],
      DEFAULT_STAGE_DAYS,
      today,
    );
    const subsetRow = aggregateIncoming(
      ORDER,
      [line({ sku: "SPRING", currentStage: "stamping", stages: SPRING })],
      DEFAULT_STAGE_DAYS,
      today,
    );
    // Spring-bar ETA is strictly sooner because it only goes through 2 more
    // stages (stamping, packaging) instead of 7. ISO `YYYY-MM-DD` strings
    // compare lexicographically the same as calendar dates.
    expect(subsetRow[0].nearestEta! < fullPipelineRow[0].nearestEta!).toBe(true);
  });
});

describe("aggregateIncomingByPo", () => {
  function poLine(overrides: Partial<IncomingPoLine> = {}): IncomingPoLine {
    return {
      ...line(),
      poNumber: "PO-00100-A",
      poId: "m1",
      supplier: "EPower",
      collections: "—",
      customer: "—",
      status: "open",
      ...overrides,
    };
  }

  it("groups incoming qty + by-stage by owning PO, not SKU", () => {
    const rows = aggregateIncomingByPo(
      ORDER,
      [
        poLine({ poNumber: "PO-00100-A", sku: "X-16", quantity: 10, currentStage: "plating" }),
        poLine({ poNumber: "PO-00100-A", sku: "X-18", quantity: 5, currentStage: "qc" }),
        poLine({ poNumber: "PO-00101", poId: "p2", supplier: "Awake", quantity: 7, currentStage: "stamping" }),
      ],
      DEFAULT_STAGE_DAYS,
      today,
    );
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.poNumber === "PO-00100-A")!;
    expect(a.incomingQty).toBe(15);
    expect(a.byStage).toEqual({ plating: 10, qc: 5 });
    expect(a.supplier).toBe("EPower");
    expect(rows.find((r) => r.poNumber === "PO-00101")!.incomingQty).toBe(7);
  });

  it("takes the nearest ETA across a PO's lines", () => {
    const rows = aggregateIncomingByPo(
      ORDER,
      [
        poLine({ currentStage: "packaging" }), // closest
        poLine({ currentStage: "stamping" }), // further out
      ],
      DEFAULT_STAGE_DAYS,
      today,
    );
    expect(rows[0].nearestEta).toBe("2026-05-25");
  });
});
