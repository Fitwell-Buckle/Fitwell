import { describe, it, expect, vi, beforeEach } from "vitest";

const { insert, values, onConflictDoUpdate, returning, select, from, where, limit } =
  vi.hoisted(() => {
    const returning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    return { insert, values, onConflictDoUpdate, returning, select, from, where, limit };
  });

vi.mock("@/lib/db", () => ({ db: { insert, select } }));

import { ingestGrapevineResponse } from "./ingest";

const basePayload = {
  providerResponseId: "resp-1",
  surveyCode: "698cc69eca3e5",
  surveyName: "Post purchase survey",
  surface: "checkout_app_block",
  questionKey: "where_first_heard",
  customerEmail: "buyer@example.com",
  shopifyOrderId: null,
  orderName: null,
  respondedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default order-resolution: no match. Individual tests override.
  limit.mockResolvedValue([]);
  returning.mockResolvedValue([{ id: "row-1" }]);
});

describe("ingestGrapevineResponse", () => {
  it("applies the platform hint for an ambiguous platform answer (Instagram = Meta, paid/organic TBD by attribution engine)", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Social Media: Instagram",
      isOther: false,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rawAnswer: "Social Media: Instagram",
        platformHint: "instagram",
        channelHint: null,
        isOtherText: false,
      }),
    );
  });

  it("commits to creator_partnerships for creator YouTube videos and ALSO sets platform=youtube", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "YouTube Video: WatchChris",
      isOther: false,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        platformHint: "youtube",
        channelHint: "creator_partnerships",
        channelDetail: "watchchris",
      }),
    );
  });

  it("uses otherText as raw_answer when isOther is true and skips channel mapping", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Other",
      isOther: true,
      otherText: "Saw it on a watch Discord server",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rawAnswer: "Saw it on a watch Discord server",
        isOtherText: true,
        channelHint: null,
      }),
    );
  });

  it("falls back to the multiple-choice answer when isOther=true but otherText is empty", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Other",
      isOther: true,
      otherText: null,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rawAnswer: "Other",
        isOtherText: true,
        channelHint: null,
      }),
    );
  });

  it("auto-detects '(* other)' suffix when isOther=false (CSV backfill path)", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Delugs (* other)",
      isOther: false, // CSV script passes false explicitly; suffix triggers detection
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rawAnswer: "Delugs",
        isOtherText: true,
        channelHint: null,
      }),
    );
  });

  it("respects explicit isOther=true even when the suffix is absent (webhook path)", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Other",
      isOther: true,
      otherText: "Saw it at a watch GTG",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rawAnswer: "Saw it at a watch GTG",
        isOtherText: true,
      }),
    );
  });

  it("stores channelHint=null for unknown multiple-choice answers (Phase 4 will normalize)", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Channel We Forgot To Map",
      isOther: false,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rawAnswer: "Channel We Forgot To Map",
        channelHint: null,
      }),
    );
  });

  it("resolves orderId from shopifyOrderId when a matching order exists", async () => {
    limit.mockResolvedValueOnce([{ id: "order-internal-id" }]);
    const result = await ingestGrapevineResponse({
      ...basePayload,
      answer: "Social Media: TikTok",
      isOther: false,
      shopifyOrderId: "gid://shopify/Order/9999",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-internal-id",
        shopifyOrderId: "gid://shopify/Order/9999",
        platformHint: "tiktok",
      }),
    );
    expect(result).toEqual({
      status: "stored",
      id: "row-1",
      orderResolved: true,
    });
  });

  it("stores shopifyOrderId with orderId=null when no matching order yet (race-safe)", async () => {
    limit.mockResolvedValueOnce([]);
    const result = await ingestGrapevineResponse({
      ...basePayload,
      answer: "Social Media: TikTok",
      isOther: false,
      shopifyOrderId: "gid://shopify/Order/late-arriver",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: null,
        shopifyOrderId: "gid://shopify/Order/late-arriver",
      }),
    );
    expect(result).toEqual({
      status: "stored",
      id: "row-1",
      orderResolved: false,
    });
  });

  it("skips the order lookup entirely when shopifyOrderId is missing", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Social Media: Instagram",
      isOther: false,
      shopifyOrderId: null,
    });
    expect(select).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: null, platformHint: "instagram" }),
    );
  });

  it("uses ON CONFLICT on (provider, providerResponseId) so Flow retries are idempotent", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Social Media: Instagram",
      isOther: false,
    });
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
    const conflictArg = (onConflictDoUpdate.mock.calls as unknown as [{ target: unknown[] }][])[0][0];
    expect(conflictArg.target).toHaveLength(2);
  });

  it("parses ISO respondedAt into a Date", async () => {
    await ingestGrapevineResponse({
      ...basePayload,
      answer: "Social Media: Instagram",
      isOther: false,
      respondedAt: "2026-06-05T12:34:56.000Z",
    });
    const insertArgs = (values.mock.calls as unknown as [{ respondedAt: Date }][])[0][0];
    expect(insertArgs.respondedAt).toBeInstanceOf(Date);
    expect(insertArgs.respondedAt.toISOString()).toBe("2026-06-05T12:34:56.000Z");
  });
});
