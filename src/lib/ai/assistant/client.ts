import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Anthropic client for the assistant, with a test seam mirroring the
 * pattern in src/lib/ai/anthropic.ts.
 */
let client: Anthropic | null = null;

export function getAssistantAnthropic(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

export function __setAssistantAnthropicForTesting(c: Anthropic | null): void {
  client = c;
}

// Default = Sonnet (cheap, fast, strong at SQL). Opus is the per-conversation
// toggle for heavy multi-table reasoning. Model ids live here so they're
// swappable in one place.
export const ASSISTANT_MODELS = {
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-8",
} as const;

export type AssistantModelKey = keyof typeof ASSISTANT_MODELS;

export function resolveModel(key: string | undefined): {
  key: AssistantModelKey;
  id: string;
} {
  const k: AssistantModelKey = key === "opus" ? "opus" : "sonnet";
  return { key: k, id: ASSISTANT_MODELS[k] };
}
