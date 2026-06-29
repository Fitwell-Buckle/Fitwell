import Anthropic from "@anthropic-ai/sdk";
import { getAssistantAnthropic, resolveModel } from "./client";
import { ASSISTANT_SYSTEM_PROMPT } from "./glossary";
import { ASSISTANT_TOOLS, executeTool, type AssistantStep } from "./tools";

/**
 * The assistant agent loop: send the conversation to Claude with the schema +
 * query tools, run whatever tools it asks for, feed results back, and repeat
 * until it produces a final text answer (or we hit the step cap — a cost
 * guardrail). Returns the answer plus every tool step for the UI to display.
 */

export interface AssistantTurnInput {
  messages: { role: "user" | "assistant"; content: string }[];
  model?: string;
  maxSteps?: number;
}

export interface AssistantTurnResult {
  answer: string;
  steps: AssistantStep[];
  model: string;
  stoppedAtStepLimit: boolean;
}

const MAX_TOKENS = 2048;
const DEFAULT_MAX_STEPS = 8;

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function runAssistantTurn(
  input: AssistantTurnInput,
): Promise<AssistantTurnResult> {
  const { id: modelId, key } = resolveModel(input.model);
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const client = getAssistantAnthropic();

  const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const steps: AssistantStep[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const res = await client.messages.create({
      model: modelId,
      max_tokens: MAX_TOKENS,
      system: ASSISTANT_SYSTEM_PROMPT,
      tools: ASSISTANT_TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      return {
        answer: textFrom(res.content),
        steps,
        model: key,
        stoppedAtStepLimit: false,
      };
    }

    const toolResults: Anthropic.ContentBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const { resultText, step: s } = await executeTool(block.name, block.input);
      steps.push(s);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: resultText,
        is_error: !s.ok,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Hit the step cap: ask once more for a final answer, no tools.
  const finalRes = await client.messages.create({
    model: modelId,
    max_tokens: MAX_TOKENS,
    system: ASSISTANT_SYSTEM_PROMPT,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Stop querying now and answer with what you have. Be explicit about " +
          "anything you couldn't determine.",
      },
    ],
  });

  return {
    answer: textFrom(finalRes.content),
    steps,
    model: key,
    stoppedAtStepLimit: true,
  };
}
