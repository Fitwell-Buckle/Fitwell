import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, setRows } = vi.hoisted(() => {
  let rows: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "leftJoin", "where", "groupBy"]) {
    chain[m] = vi.fn(() => chain);
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(rows);
  return { db: chain, setRows: (r: unknown[]) => (rows = r) };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/schema", () => ({
  customer: { utmSource: "s", utmMedium: "m", id: "id" },
  order: {
    id: "id",
    customerId: "cid",
    totalPrice: "tp",
    processedAt: "pa",
    linkMethod: "lm",
  },
  utmAttribution: {},
}));

import { getChannelPerformance, getLinkConfidence } from "./attribution";

beforeEach(() => vi.clearAllMocks());

describe("getChannelPerformance", () => {
  it("rolls orders + revenue up by first-touch channel, sorted by revenue", async () => {
    setRows([
      { source: "google", medium: "cpc", orders: 5, revenue: 20000 },
      { source: "google", medium: "organic", orders: 2, revenue: 8000 },
      { source: "facebook", medium: null, orders: 3, revenue: 30000 },
      { source: null, medium: null, orders: 1, revenue: 1000 },
    ]);
    const res = await getChannelPerformance(new Date(0), new Date());
    expect(res).toEqual([
      { channel: "social", orders: 3, revenue: 30000 },
      { channel: "paid_search", orders: 5, revenue: 20000 },
      { channel: "organic_search", orders: 2, revenue: 8000 },
      { channel: "direct", orders: 1, revenue: 1000 },
    ]);
  });
});

describe("getLinkConfidence", () => {
  it("buckets orders by link_method, null → unattributed", async () => {
    setRows([
      { linkMethod: "pixel", count: 12 },
      { linkMethod: "email_match", count: 4 },
      { linkMethod: null, count: 7 },
    ]);
    const res = await getLinkConfidence(new Date(0), new Date());
    expect(res).toEqual({ pixel: 12, emailMatch: 4, unattributed: 7 });
  });
});
