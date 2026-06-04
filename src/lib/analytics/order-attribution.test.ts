import { describe, it, expect, vi, beforeEach } from "vitest";

const { captureEvent, identify } = vi.hoisted(() => ({
  captureEvent: vi.fn(),
  identify: vi.fn(),
}));

vi.mock("./posthog", () => ({ captureEvent, identify }));

// Chainable Drizzle stub: every builder method returns the same thenable,
// resolving to `rows` for selects and undefined for writes.
const { db, setSelectRows } = vi.hoisted(() => {
  let rows: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "update",
    "set",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  // `await chain` (selects) yields rows; writes also await the chain.
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(rows);
  return {
    db: chain,
    setSelectRows: (r: unknown[]) => {
      rows = r;
    },
  };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/schema", () => ({
  customer: { id: "id", posthogDistinctId: "fw" },
  order: { id: "id" },
  utmAttribution: {
    id: "id",
    posthogDistinctId: "fw",
    visitorId: "v",
    capturedAt: "c",
    convertedAt: "cv",
  },
}));

import {
  extractFwDistinctId,
  linkOrderToAttribution,
} from "./order-attribution";
import type { ShopifyOrder } from "@/types/shopify";

function order(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: 555,
    order_number: 1001,
    email: "buyer@example.com",
    total_price: "40.00",
    currency: "USD",
    processed_at: "2026-05-18T00:00:00Z",
    created_at: "2026-05-18T00:00:00Z",
    line_items: [{ title: "M1 Buckle", sku: "M1", quantity: 1 } as never],
    note_attributes: [],
    ...overrides,
  } as ShopifyOrder;
}

beforeEach(() => {
  vi.clearAllMocks();
  setSelectRows([]);
});

describe("extractFwDistinctId", () => {
  it("reads the _fw_distinct_id note attribute", () => {
    expect(
      extractFwDistinctId(
        order({ note_attributes: [{ name: "_fw_distinct_id", value: "ph_9" }] }),
      ),
    ).toBe("ph_9");
  });

  it("returns null when absent, empty, or whitespace", () => {
    expect(extractFwDistinctId(order())).toBeNull();
    expect(
      extractFwDistinctId(
        order({ note_attributes: [{ name: "_fw_distinct_id", value: "  " }] }),
      ),
    ).toBeNull();
    expect(
      extractFwDistinctId(
        order({ note_attributes: [{ name: "other", value: "x" }] }),
      ),
    ).toBeNull();
  });
});

describe("linkOrderToAttribution", () => {
  it("pixel path: stamps link_method, enriches person, captures purchase", async () => {
    setSelectRows([
      { id: "t1", source: "google", medium: "cpc", campaign: "spring", converted: false },
    ]);
    const res = await linkOrderToAttribution(
      "ord1",
      "cust1",
      order({ note_attributes: [{ name: "_fw_distinct_id", value: "ph_9" }] }),
    );
    expect(res.linkMethod).toBe("pixel");
    expect(identify).toHaveBeenCalledWith(
      "ph_9",
      expect.objectContaining({ email: "buyer@example.com" }),
      expect.objectContaining({ utm_source: "google" }),
    );
    expect(captureEvent).toHaveBeenCalledWith(
      "ph_9",
      "purchase_completed",
      expect.objectContaining({ order_id: 555, order_value: 40 }),
    );
  });

  it("no pixel id and no customer → null, no PostHog", async () => {
    const res = await linkOrderToAttribution("ord1", null, order());
    expect(res.linkMethod).toBeNull();
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("never throws — DB errors resolve to null", async () => {
    const boom = (
      db.select as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const res = await linkOrderToAttribution(
      "ord1",
      "cust1",
      order({ note_attributes: [{ name: "_fw_distinct_id", value: "ph_9" }] }),
    );
    expect(res.linkMethod).toBeNull(); // error caught, degrades safely
    boom.mockRestore();
  });
});
