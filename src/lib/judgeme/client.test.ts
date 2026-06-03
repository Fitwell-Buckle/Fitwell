import { describe, it, expect } from "vitest";
import { normalizeReview } from "./client";

describe("normalizeReview", () => {
  it("maps standard Judge.me API fields onto the normalized shape", () => {
    const n = normalizeReview({
      id: 12345,
      title: "Great buckle",
      body: "Fits perfectly",
      rating: 5,
      verified: true,
      reviewer: { email: "user@example.com", name: "Jane Doe" },
      product_external_id: "shopify-prod-1",
      product_handle: "fitwell-classic",
      created_at: "2026-05-01T12:34:56Z",
    });

    expect(n.externalId).toBe("12345");
    expect(n.source).toBe("judgeme");
    expect(n.title).toBe("Great buckle");
    expect(n.body).toBe("Fits perfectly");
    expect(n.rating).toBe(5);
    expect(n.verified).toBe(true);
    expect(n.reviewerEmail).toBe("user@example.com");
    expect(n.reviewerName).toBe("Jane Doe");
    expect(n.productId).toBe("shopify-prod-1");
    expect(n.productHandle).toBe("fitwell-classic");
    expect(n.reviewDate?.toISOString()).toBe("2026-05-01T12:34:56.000Z");
  });

  it("stringifies numeric id (for consistent upsert dedup)", () => {
    expect(normalizeReview({ id: 42 }).externalId).toBe("42");
    expect(normalizeReview({ id: "abc-9" }).externalId).toBe("abc-9");
  });

  it("lowercases + trims the reviewer email so customer joins are stable", () => {
    expect(
      normalizeReview({
        id: 1,
        reviewer: { email: "  Mixed.CASE@Example.COM  " },
      }).reviewerEmail,
    ).toBe("mixed.case@example.com");
  });

  it("trims (but preserves case in) the reviewer name", () => {
    expect(
      normalizeReview({ id: 1, reviewer: { name: "  Jane Doe  " } })
        .reviewerName,
    ).toBe("Jane Doe");
  });

  it("returns null reviewer fields when reviewer object is missing or empty", () => {
    expect(normalizeReview({ id: 1, reviewer: null }).reviewerEmail).toBeNull();
    expect(normalizeReview({ id: 1, reviewer: undefined }).reviewerEmail).toBeNull();
    expect(
      normalizeReview({ id: 1, reviewer: { email: "" } }).reviewerEmail,
    ).toBeNull();
  });

  it("treats various truthy verified values as verified=true", () => {
    expect(normalizeReview({ id: 1, verified: true }).verified).toBe(true);
    expect(normalizeReview({ id: 1, verified: "true" }).verified).toBe(true);
    expect(
      normalizeReview({ id: 1, verified: "verified-buyer" }).verified,
    ).toBe(true);
    expect(
      normalizeReview({ id: 1, verified: "verified-customer" }).verified,
    ).toBe(true);
  });

  it("falls back to verified=false for everything else", () => {
    expect(normalizeReview({ id: 1, verified: false }).verified).toBe(false);
    expect(normalizeReview({ id: 1, verified: null }).verified).toBe(false);
    expect(normalizeReview({ id: 1, verified: undefined }).verified).toBe(false);
    expect(normalizeReview({ id: 1, verified: "anything-else" }).verified).toBe(
      false,
    );
  });

  it("parses string ratings ('5', '4.5') as numbers", () => {
    expect(normalizeReview({ id: 1, rating: "5" }).rating).toBe(5);
    expect(normalizeReview({ id: 1, rating: "4.5" }).rating).toBe(4.5);
    expect(normalizeReview({ id: 1, rating: "" }).rating).toBeNull();
    expect(
      normalizeReview({ id: 1, rating: "not-a-number" }).rating,
    ).toBeNull();
  });

  it("returns null reviewDate for missing or malformed created_at", () => {
    expect(normalizeReview({ id: 1 }).reviewDate).toBeNull();
    expect(normalizeReview({ id: 1, created_at: null }).reviewDate).toBeNull();
    expect(
      normalizeReview({ id: 1, created_at: "not-a-date" }).reviewDate,
    ).toBeNull();
  });

  it("trims whitespace in title and body, returning null when empty", () => {
    expect(normalizeReview({ id: 1, title: "  hi  " }).title).toBe("hi");
    expect(normalizeReview({ id: 1, body: "  hi  " }).body).toBe("hi");
    expect(normalizeReview({ id: 1, title: "   " }).title).toBeNull();
    expect(normalizeReview({ id: 1, body: "   " }).body).toBeNull();
  });

  it("sets location to null — API doesn't expose it (CSV export does)", () => {
    expect(normalizeReview({ id: 1 }).location).toBeNull();
  });
});
