import { describe, it, expect } from "vitest";
import {
  addDays,
  lineItemsNeedingAlert,
  posNeedingReceiveNag,
  type AlertLine,
} from "@/lib/production/alerts";

function aline(overrides: Partial<AlertLine> = {}): AlertLine {
  return {
    id: "li-1",
    sku: "FBW001-SS-16",
    title: "Buckle",
    currentStage: "plating",
    dueDate: "2026-05-26",
    poId: "po-1",
    poNumber: "PO-1",
    supplierId: "sup-1",
    supplierName: "Acme",
    supplierEmail: "ops@acme.com",
    ...overrides,
  };
}

describe("addDays", () => {
  it("adds days across month boundaries (UTC)", () => {
    expect(addDays("2026-05-30", 3)).toBe("2026-06-02");
    expect(addDays("2026-01-01", 0)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("lineItemsNeedingAlert", () => {
  const today = "2026-05-24";

  it("includes a not-complete line due within the window", () => {
    const out = lineItemsNeedingAlert({
      lineItems: [aline({ dueDate: "2026-05-26" })],
      today,
      withinDays: 3,
    });
    expect(out).toHaveLength(1);
    expect(out[0].overdue).toBe(false);
  });

  it("flags an overdue line and includes it", () => {
    const out = lineItemsNeedingAlert({
      lineItems: [aline({ dueDate: "2026-05-20" })],
      today,
      withinDays: 3,
    });
    expect(out).toHaveLength(1);
    expect(out[0].overdue).toBe(true);
  });

  it("excludes lines due beyond the window", () => {
    const out = lineItemsNeedingAlert({
      lineItems: [aline({ dueDate: "2026-06-10" })],
      today,
      withinDays: 3,
    });
    expect(out).toHaveLength(0);
  });

  it("excludes completed lines even if overdue", () => {
    const out = lineItemsNeedingAlert({
      lineItems: [aline({ currentStage: "complete", dueDate: "2026-05-01" })],
      today,
      withinDays: 3,
    });
    expect(out).toHaveLength(0);
  });

  it("excludes lines without a due date", () => {
    const out = lineItemsNeedingAlert({
      lineItems: [aline({ dueDate: null })],
      today,
      withinDays: 3,
    });
    expect(out).toHaveLength(0);
  });

  it("includes a line due exactly on the cutoff", () => {
    const out = lineItemsNeedingAlert({
      lineItems: [aline({ dueDate: "2026-05-27" })], // today + 3
      today,
      withinDays: 3,
    });
    expect(out).toHaveLength(1);
  });
});

describe("posNeedingReceiveNag", () => {
  it("nags a fully-complete PO that hasn't been received", () => {
    const out = posNeedingReceiveNag([
      { id: "po-1", poNumber: "PO-1", lineStages: ["complete", "complete"], receivedAt: null },
    ]);
    expect(out).toEqual([{ id: "po-1", poNumber: "PO-1" }]);
  });

  it("does not nag once received", () => {
    const out = posNeedingReceiveNag([
      {
        id: "po-1",
        poNumber: "PO-1",
        lineStages: ["complete"],
        receivedAt: new Date(),
      },
    ]);
    expect(out).toHaveLength(0);
  });

  it("does not nag a PO with a line still in production", () => {
    const out = posNeedingReceiveNag([
      { id: "po-1", poNumber: "PO-1", lineStages: ["complete", "qc"], receivedAt: null },
    ]);
    expect(out).toHaveLength(0);
  });

  it("does not nag a PO with no line items", () => {
    const out = posNeedingReceiveNag([
      { id: "po-1", poNumber: "PO-1", lineStages: [], receivedAt: null },
    ]);
    expect(out).toHaveLength(0);
  });
});
