import { afterEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  __setAnthropicClientForTesting,
  summarizeAll,
  triageStories,
  writeSubjectLine,
} from "./editorial";
import type { BriefStory, RawStory } from "./types";

function makeMockClient(
  createImpl: (...args: unknown[]) => Promise<unknown>,
): Anthropic {
  return { messages: { create: createImpl as never } } as unknown as Anthropic;
}

function toolUseResponse(name: string, input: unknown) {
  return { content: [{ type: "tool_use", name, input }] };
}

function story(overrides: Partial<RawStory>): RawStory {
  return {
    sourceSlug: "hodinkee",
    sourceName: "Hodinkee",
    url: "https://hodinkee.com/a",
    title: "Rolex Names New CEO",
    excerpt: "A big change at the top.",
    publishedAt: null,
    imageUrl: null,
    ...overrides,
  };
}

afterEach(() => __setAnthropicClientForTesting(null));

describe("triageStories", () => {
  it("returns verdicts matched by url", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () =>
        toolUseResponse("record_triage", {
          verdicts: [
            {
              url: "https://hodinkee.com/a",
              include: true,
              droppedReason: null,
              segment: "luxury",
              type: "business",
              priority: 1,
              duplicateOfUrl: null,
            },
          ],
        }),
      ),
    );
    const verdicts = await triageStories([story({})]);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ include: true, segment: "luxury" });
  });

  it("treats missing verdicts as dropped instead of failing", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () => toolUseResponse("record_triage", { verdicts: [] })),
    );
    const verdicts = await triageStories([story({})]);
    expect(verdicts[0]).toMatchObject({
      include: false,
      droppedReason: "no verdict returned",
    });
  });

  it("downgrades include verdicts missing segment/type", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () =>
        toolUseResponse("record_triage", {
          verdicts: [
            {
              url: "https://hodinkee.com/a",
              include: true,
              droppedReason: null,
              segment: null,
              type: null,
              priority: 1,
              duplicateOfUrl: null,
            },
          ],
        }),
      ),
    );
    const verdicts = await triageStories([story({})]);
    expect(verdicts[0].include).toBe(false);
  });

  it("retries once on invalid tool input, then throws", async () => {
    let calls = 0;
    __setAnthropicClientForTesting(
      makeMockClient(async () => {
        calls++;
        return toolUseResponse("record_triage", { verdicts: "garbage" });
      }),
    );
    await expect(triageStories([story({})])).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it("returns [] for an empty batch without calling the API", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () => {
        throw new Error("should not be called");
      }),
    );
    await expect(triageStories([])).resolves.toEqual([]);
  });
});

describe("summarizeAll", () => {
  it("falls back to the feed excerpt when a summary call fails", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () => {
        throw new Error("api down");
      }),
    );
    const result = await summarizeAll([
      { ...story({}), segment: "luxury", type: "business" },
    ]);
    expect(result[0].summary).toBe("A big change at the top.");
  });

  it("uses the model summary when the call succeeds", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () =>
        toolUseResponse("record_summary", {
          summary: "Rolex shuffled the C-suite; suppliers should pay attention.",
        }),
      ),
    );
    const result = await summarizeAll([
      { ...story({}), segment: "luxury", type: "business" },
    ]);
    expect(result[0].summary).toContain("C-suite");
  });
});

describe("writeSubjectLine", () => {
  function briefStory(overrides: Partial<BriefStory>): BriefStory {
    return {
      ...story({}),
      segment: "luxury",
      type: "business",
      summary: "A summary.",
      ...overrides,
    };
  }

  it("returns the model's subject + preheader", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () =>
        toolUseResponse("record_subject", {
          subject: "Rolex names a new CEO",
          preheader: "Plus 13 new releases, led by Baltic",
        }),
      ),
    );
    const result = await writeSubjectLine([briefStory({})]);
    expect(result.subject).toBe("Rolex names a new CEO");
    expect(result.preheader).toContain("releases");
  });

  it("retries once then throws on persistent validation failure (caller falls back)", async () => {
    __setAnthropicClientForTesting(
      makeMockClient(async () =>
        toolUseResponse("record_subject", { subject: "x" }), // missing preheader, too short
      ),
    );
    await expect(writeSubjectLine([briefStory({})])).rejects.toThrow();
  });
});
