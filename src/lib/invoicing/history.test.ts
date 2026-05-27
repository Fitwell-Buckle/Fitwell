import { describe, it, expect } from "vitest";
import { buildInvoiceHistory, type InvoiceTimestamps } from "./history";

const none: InvoiceTimestamps = {
  createdAt: null,
  sentAt: null,
  depositPaidAt: null,
  fulfilledAt: null,
  balancePaidAt: null,
  paidAt: null,
};

describe("buildInvoiceHistory", () => {
  it("returns only milestones that happened, in chronological order", () => {
    const h = buildInvoiceHistory({
      ...none,
      createdAt: new Date("2026-05-01T10:00:00Z"),
      sentAt: new Date("2026-05-02T10:00:00Z"),
      paidAt: new Date("2026-05-05T10:00:00Z"),
    });
    expect(h.map((e) => e.label)).toEqual([
      "Invoice created",
      "Invoice sent",
      "Paid in full",
    ]);
    expect(h[0].at).toBe("2026-05-01T10:00:00.000Z");
  });

  it("omits milestones with no timestamp", () => {
    const h = buildInvoiceHistory({ ...none, createdAt: new Date("2026-05-01T10:00:00Z") });
    expect(h).toHaveLength(1);
    expect(h[0].label).toBe("Invoice created");
  });

  it("includes the company name on the sent entry", () => {
    const h = buildInvoiceHistory(
      { ...none, sentAt: new Date("2026-05-02T10:00:00Z") },
      { companyName: "Acme Co" },
    );
    expect(h[0].label).toBe("Invoice sent to Acme Co");
  });

  it("sorts deposit, fulfillment and balance events by time", () => {
    const h = buildInvoiceHistory({
      ...none,
      createdAt: new Date("2026-05-01T10:00:00Z"),
      depositPaidAt: new Date("2026-05-03T10:00:00Z"),
      fulfilledAt: new Date("2026-05-10T10:00:00Z"),
      balancePaidAt: new Date("2026-05-12T10:00:00Z"),
    });
    expect(h.map((e) => e.label)).toEqual([
      "Invoice created",
      "Deposit paid",
      "Marked fulfilled — balance billed",
      "Balance paid",
    ]);
  });

  it("returns empty for a brand-new invoice with no timestamps", () => {
    expect(buildInvoiceHistory(none)).toEqual([]);
  });
});
