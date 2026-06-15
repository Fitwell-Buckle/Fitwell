import { describe, it, expect, vi, beforeEach } from "vitest";

const { findManyInvoice, findFirstCompany, notifyB2bWireClaim } = vi.hoisted(() => ({
  findManyInvoice: vi.fn(),
  findFirstCompany: vi.fn(),
  notifyB2bWireClaim: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      invoice: { findMany: findManyInvoice },
      company: { findFirst: findFirstCompany },
    },
  },
}));
vi.mock("@/lib/schema", () => ({ invoice: {}, company: {} }));
vi.mock("./order-notifications", () => ({ notifyB2bWireClaim }));

import { looksLikeWireClaim, maybeNotifyWireClaim } from "./wire-claim";

beforeEach(() => vi.clearAllMocks());

describe("looksLikeWireClaim", () => {
  it.each([
    ["Payment sent", "We've wired the payment for INV-00100"],
    ["Re: invoice", "bank transfer completed this morning"],
    [null, "Just paid the invoice, thanks"],
    ["Wire transfer done", null],
  ] as [string | null, string | null][])("flags a wire claim (%s / %s)", (subject, snippet) => {
    expect(looksLikeWireClaim(subject, snippet)).toBe(true);
  });

  it.each([
    ["Question about my order", "When will the wireless buckles ship?"],
    ["Reorder", "Can I get 50 more units?"],
    [null, null],
  ] as [string | null, string | null][])("ignores non-payment mail (%s / %s)", (subject, snippet) => {
    expect(looksLikeWireClaim(subject, snippet)).toBe(false);
  });
});

describe("maybeNotifyWireClaim", () => {
  it("does nothing when the company has no open wire invoice", async () => {
    findManyInvoice.mockResolvedValue([]);
    await maybeNotifyWireClaim("co1", "buyer@acme.co");
    expect(notifyB2bWireClaim).not.toHaveBeenCalled();
  });

  it("links the single open wire invoice", async () => {
    findManyInvoice.mockResolvedValue([{ id: "inv1", invoiceNumber: "INV-00100" }]);
    findFirstCompany.mockResolvedValue({ name: "Acme" });
    await maybeNotifyWireClaim("co1", "buyer@acme.co");
    expect(notifyB2bWireClaim).toHaveBeenCalledWith({
      companyId: "co1",
      companyName: "Acme",
      invoiceId: "inv1",
      invoiceNumber: "INV-00100",
      fromEmail: "buyer@acme.co",
    });
  });

  it("omits the invoice link when several wire orders are open", async () => {
    findManyInvoice.mockResolvedValue([
      { id: "inv1", invoiceNumber: "INV-1" },
      { id: "inv2", invoiceNumber: "INV-2" },
    ]);
    findFirstCompany.mockResolvedValue({ name: "Acme" });
    await maybeNotifyWireClaim("co1", "buyer@acme.co");
    expect(notifyB2bWireClaim).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: undefined, invoiceNumber: undefined }),
    );
  });
});
