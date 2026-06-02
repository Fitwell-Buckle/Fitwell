import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbCalls } = vi.hoisted(() => {
  const dbCalls = {
    insert: vi.fn(),
    insertValues: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    delete: vi.fn(),
    where: vi.fn(),
  };
  return { dbCalls };
});

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => {
      dbCalls.insert();
      return {
        values: (v: unknown) => {
          dbCalls.insertValues(v);
          return {
            onConflictDoUpdate: (o: unknown) => {
              dbCalls.onConflictDoUpdate(o);
              return Promise.resolve();
            },
          };
        },
      };
    },
    delete: () => {
      dbCalls.delete();
      return {
        where: () => {
          dbCalls.where();
          return Promise.resolve();
        },
      };
    },
  },
}));

vi.mock("@/lib/schema", () => ({
  klaviyoEmailPerformance: { campaignId: "campaign_id" },
  klaviyoFlowAttribution: {
    customerId: "customer_id",
    orderId: "order_id",
    touchedAt: "touched_at",
  },
  klaviyoListGrowthDaily: { date: "date", listId: "list_id" },
}));

import {
  extractCampaignPerformance,
  extractFlowAggregates,
} from "./extract";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    campaignValuesReport: vi.fn().mockResolvedValue([]),
    flowValuesReport: vi.fn().mockResolvedValue([]),
    getCampaigns: vi.fn().mockResolvedValue(new Map()),
    getFlows: vi.fn().mockResolvedValue(new Map()),
    ...overrides,
  } as unknown as import("./client").KlaviyoClient;
}

describe("extractCampaignPerformance", () => {
  it("upserts one row per campaign and converts revenue dollars to cents", async () => {
    const client = makeClient({
      campaignValuesReport: vi.fn().mockResolvedValue([
        {
          groupings: { campaign_id: "c1" },
          statistics: {
            recipients: 1000,
            opens_unique: 250,
            clicks_unique: 30,
            conversion_uniques: 8,
            conversion_value: 612.5,
          },
        },
      ]),
      getCampaigns: vi.fn().mockResolvedValue(
        new Map([
          [
            "c1",
            { name: "Welcome flow blast", sendTime: new Date("2026-05-01") },
          ],
        ]),
      ),
    });

    const n = await extractCampaignPerformance(client, "metric_placed_order");

    expect(n).toBe(1);
    expect(dbCalls.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "c1",
        campaignName: "Welcome flow blast",
        sends: 1000,
        opens: 250,
        clicks: 30,
        conversions: 8,
        revenueCents: 61250,
      }),
    );
    expect(dbCalls.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("returns 0 and writes nothing when Klaviyo has no campaigns", async () => {
    const client = makeClient();
    const n = await extractCampaignPerformance(client, "metric_placed_order");
    expect(n).toBe(0);
    expect(dbCalls.insertValues).not.toHaveBeenCalled();
  });
});

describe("extractFlowAggregates", () => {
  it("writes aggregate rows (customer_id/order_id null) for each flow", async () => {
    const client = makeClient({
      flowValuesReport: vi.fn().mockResolvedValue([
        {
          groupings: { flow_id: "f_welcome" },
          statistics: {
            opens_unique: 500,
            conversion_uniques: 12,
            conversion_value: 1104,
          },
        },
        {
          groupings: { flow_id: "f_post_purchase" },
          statistics: {
            opens_unique: 100,
            conversion_uniques: 2,
            conversion_value: 184.5,
          },
        },
      ]),
      getFlows: vi.fn().mockResolvedValue(
        new Map([
          ["f_welcome", "Welcome flow"],
          ["f_post_purchase", "Post-purchase"],
        ]),
      ),
    });

    const n = await extractFlowAggregates(client, "metric_placed_order");

    expect(n).toBe(2);
    // Aggregate dedup: today's rows for aggregate grain are deleted first
    expect(dbCalls.delete).toHaveBeenCalled();
    expect(dbCalls.insertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        flowId: "f_welcome",
        flowName: "Welcome flow",
        customerId: null,
        orderId: null,
        attributedRevenueCents: 110400,
        attributedOrderCount: 12,
      }),
      expect.objectContaining({
        flowId: "f_post_purchase",
        flowName: "Post-purchase",
        attributedRevenueCents: 18450,
        attributedOrderCount: 2,
      }),
    ]);
  });
});
