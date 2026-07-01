import { describe, it, expect, vi, beforeEach } from "vitest";

const { getReviewSummary } = vi.hoisted(() => ({ getReviewSummary: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/reviews/summary", () => ({ getReviewSummary }));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/review-summary", () => {
  it("returns { data: { rating, count } } with open CORS", async () => {
    getReviewSummary.mockResolvedValue({ rating: 4.6, count: 97 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ data: { rating: 4.6, count: 97 } });
  });

  it("500s with { error } when the summary lookup throws", async () => {
    getReviewSummary.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "review summary unavailable" });
  });
});
