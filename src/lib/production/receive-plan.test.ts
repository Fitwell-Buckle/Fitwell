import { describe, it, expect } from "vitest";
import { planReceiveLine, type ReceiveLineInput } from "@/lib/production/receive-plan";

function line(overrides: Partial<ReceiveLineInput> = {}): ReceiveLineInput {
  return {
    id: "li-1",
    currentStage: "complete",
    quantity: 10,
    shopifyVariantId: "111",
    shopifyReceivedAt: null,
    effectiveLocationId: "222",
    ...overrides,
  };
}

describe("planReceiveLine", () => {
  it("is ready when complete, has a variant + warehouse, and not yet received", () => {
    const p = planReceiveLine(line());
    expect(p.status).toBe("ready");
    expect(p).toMatchObject({ variantId: "111", locationId: "222", quantity: 10 });
  });

  it("is already_received when the line has a receive timestamp", () => {
    expect(planReceiveLine(line({ shopifyReceivedAt: new Date() })).status).toBe(
      "already_received",
    );
  });

  it("already_received takes precedence over an incomplete stage", () => {
    expect(
      planReceiveLine(line({ shopifyReceivedAt: new Date(), currentStage: "polishing" }))
        .status,
    ).toBe("already_received");
  });

  it("is not_ready when the line hasn't reached the complete stage", () => {
    expect(planReceiveLine(line({ currentStage: "plating" })).status).toBe("not_ready");
  });

  it("is no_variant when there's no shopify_variant_id", () => {
    expect(planReceiveLine(line({ shopifyVariantId: null })).status).toBe("no_variant");
  });

  it("is no_warehouse when there's no effective location", () => {
    expect(planReceiveLine(line({ effectiveLocationId: null })).status).toBe(
      "no_warehouse",
    );
  });

  it("checks readiness before variant/warehouse (a non-complete line is not_ready)", () => {
    expect(
      planReceiveLine(
        line({ currentStage: "qc", shopifyVariantId: null, effectiveLocationId: null }),
      ).status,
    ).toBe("not_ready");
  });
});
