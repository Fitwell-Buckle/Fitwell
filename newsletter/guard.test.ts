import { describe, expect, it, vi } from "vitest";
import { campaignAlreadySent, isAlreadySent } from "./guard";
import type { KlaviyoClient } from "../src/lib/klaviyo/client";

describe("isAlreadySent", () => {
  it("treats a missing campaign as not-sent (proceed)", () => {
    expect(isAlreadySent(null)).toBe(false);
  });

  it("treats a draft as not-sent, case-insensitively", () => {
    expect(isAlreadySent({ status: "Draft" })).toBe(false);
    expect(isAlreadySent({ status: "draft" })).toBe(false);
  });

  it("treats any non-draft status as sent (back off)", () => {
    for (const status of ["Sent", "sent", "Sending", "Scheduled", "Queued without Recipients"]) {
      expect(isAlreadySent({ status })).toBe(true);
    }
  });
});

describe("campaignAlreadySent", () => {
  function clientWith(
    impl: KlaviyoClient["getCampaignByName"],
  ): KlaviyoClient {
    return { getCampaignByName: impl } as unknown as KlaviyoClient;
  }

  it("returns false when no campaign exists for the slug", async () => {
    const client = clientWith(vi.fn().mockResolvedValue(null));
    expect(await campaignAlreadySent("micro-adjust-2026-06-13-auto", client)).toBe(false);
  });

  it("returns true when the slug's campaign has already sent", async () => {
    const client = clientWith(
      vi.fn().mockResolvedValue({ id: "c1", status: "Sent", messageId: "m1" }),
    );
    expect(await campaignAlreadySent("micro-adjust-2026-06-13-auto", client)).toBe(true);
  });

  it("fails soft (returns false) if the Klaviyo lookup throws", async () => {
    const client = clientWith(vi.fn().mockRejectedValue(new Error("503 from Klaviyo")));
    expect(await campaignAlreadySent("micro-adjust-2026-06-13-auto", client)).toBe(false);
  });
});
