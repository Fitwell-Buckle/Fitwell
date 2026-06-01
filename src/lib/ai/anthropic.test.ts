import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  BusinessCardSchema,
  __setAnthropicClientForTesting,
  extractBusinessCard,
} from "@/lib/ai/anthropic";

const validToolInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@analytic.example",
  phone: "+44 20 7946 0000",
  title: "Chief Engineer",
  companyName: "Analytical Engines Ltd",
  website: "analytic.example",
  confidence: {
    firstName: 0.99,
    lastName: 0.99,
    email: 0.95,
    phone: 0.9,
    title: 0.8,
    companyName: 0.97,
    website: 0.6,
  },
  rawText: "Ada Lovelace\nChief Engineer\nAnalytical Engines Ltd",
};

function makeMockClient(
  createImpl: (...args: unknown[]) => Promise<unknown>,
): Anthropic {
  return {
    messages: { create: createImpl as never },
  } as unknown as Anthropic;
}

function toolUseResponse(input: unknown) {
  return {
    content: [
      { type: "tool_use", name: "record_business_card", input },
    ],
  };
}

afterEach(() => {
  __setAnthropicClientForTesting(null);
});

describe("BusinessCardSchema", () => {
  it("accepts a fully populated payload", () => {
    expect(BusinessCardSchema.parse(validToolInput)).toEqual(validToolInput);
  });

  it("accepts nulls for every field but rawText + confidence", () => {
    expect(
      BusinessCardSchema.parse({
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        title: null,
        companyName: null,
        website: null,
        confidence: {},
        rawText: "",
      }),
    ).toBeTruthy();
  });

  it("rejects when rawText is missing", () => {
    const { rawText: _drop, ...withoutRaw } = validToolInput;
    expect(BusinessCardSchema.safeParse(withoutRaw).success).toBe(false);
  });

  it("rejects when confidence values are outside 0..1", () => {
    expect(
      BusinessCardSchema.safeParse({
        ...validToolInput,
        confidence: { ...validToolInput.confidence, email: 1.7 },
      }).success,
    ).toBe(false);
  });

  it("rejects when a string field is the wrong type", () => {
    expect(
      BusinessCardSchema.safeParse({ ...validToolInput, email: 42 }).success,
    ).toBe(false);
  });
});

describe("extractBusinessCard", () => {
  it("returns parsed fields on a clean first response", async () => {
    const create = vi.fn().mockResolvedValueOnce(toolUseResponse(validToolInput));
    __setAnthropicClientForTesting(makeMockClient(create));

    const result = await extractBusinessCard({
      imageBase64: "AAAA",
      mediaType: "image/jpeg",
    });

    expect(result).toEqual(validToolInput);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries once when the first response fails validation and succeeds on the second", async () => {
    const badInput = { ...validToolInput, email: 42 };
    const create = vi
      .fn()
      .mockResolvedValueOnce(toolUseResponse(badInput))
      .mockResolvedValueOnce(toolUseResponse(validToolInput));
    __setAnthropicClientForTesting(makeMockClient(create));

    const result = await extractBusinessCard({
      imageBase64: "AAAA",
      mediaType: "image/jpeg",
    });

    expect(result).toEqual(validToolInput);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("surfaces a validation error when both attempts return malformed input", async () => {
    const badInput = { ...validToolInput, email: 42 };
    const create = vi.fn().mockResolvedValue(toolUseResponse(badInput));
    __setAnthropicClientForTesting(makeMockClient(create));

    await expect(
      extractBusinessCard({ imageBase64: "AAAA", mediaType: "image/jpeg" }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws when the model omits the tool_use block entirely", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "I refuse." }],
    });
    __setAnthropicClientForTesting(makeMockClient(create));

    await expect(
      extractBusinessCard({ imageBase64: "AAAA", mediaType: "image/jpeg" }),
    ).rejects.toThrow(/tool_use/);
  });
});
