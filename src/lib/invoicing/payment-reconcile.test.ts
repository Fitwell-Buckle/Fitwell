import { describe, it, expect } from "vitest";
import { classifyDraftPayment, paymentAmountCents } from "./payment-reconcile";

const base = {
  shopifyDraftOrderId: "D1",
  shopifyBalanceDraftOrderId: null,
  depositCents: 0,
  depositPaidAt: null,
};

describe("classifyDraftPayment", () => {
  it("main draft, no deposit → full payment", () => {
    expect(classifyDraftPayment(base, "D1")).toBe("full");
  });

  it("main draft with an outstanding deposit → deposit", () => {
    expect(classifyDraftPayment({ ...base, depositCents: 2000 }, "D1")).toBe("deposit");
  });

  it("main draft, deposit already paid → full (balance via main is the rest)", () => {
    expect(
      classifyDraftPayment({ ...base, depositCents: 2000, depositPaidAt: new Date("2026-01-01") }, "D1"),
    ).toBe("full");
  });

  it("balance draft is matched first → balance", () => {
    expect(
      classifyDraftPayment({ ...base, shopifyBalanceDraftOrderId: "D2", depositCents: 2000 }, "D2"),
    ).toBe("balance");
  });

  it("unknown draft id → null", () => {
    expect(classifyDraftPayment(base, "DX")).toBeNull();
  });
});

describe("paymentAmountCents", () => {
  it("deposit covers the deposit", () => expect(paymentAmountCents(6000, 2000, "deposit")).toBe(2000));
  it("balance covers total − deposit", () => expect(paymentAmountCents(6000, 2000, "balance")).toBe(4000));
  it("full covers the total", () => expect(paymentAmountCents(6000, 2000, "full")).toBe(6000));
  it("balance never goes negative", () => expect(paymentAmountCents(1000, 2000, "balance")).toBe(0));
});
