import { describe, it, expect, afterEach } from "vitest";
import { runAssistantTurn } from "./agent";
import { __setAssistantAnthropicForTesting } from "./client";
import { __setReadOnlyExecutorForTesting } from "./readonly-db";

// Minimal fake Anthropic client: returns scripted responses in order.
function fakeClient(responses: unknown[]) {
  let i = 0;
  return {
    messages: {
      create: async () => responses[i++],
    },
  } as never;
}

afterEach(() => {
  __setAssistantAnthropicForTesting(null);
  __setReadOnlyExecutorForTesting(null);
});

describe("runAssistantTurn", () => {
  it("runs a query tool then returns the final answer with steps", async () => {
    __setReadOnlyExecutorForTesting(async () => ({
      rows: [{ count: "42" }],
      fields: [{ name: "count" }],
    }));
    __setAssistantAnthropicForTesting(
      fakeClient([
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "query_database",
              input: { sql: "SELECT count(*) FROM \"order\"" },
            },
          ],
        },
        {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "There are 42 qualifying orders." }],
        },
      ]),
    );

    const r = await runAssistantTurn({
      messages: [{ role: "user", content: "how many orders?" }],
    });

    expect(r.answer).toMatch(/42/);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].tool).toBe("query_database");
    expect(r.steps[0].ok).toBe(true);
    expect(r.steps[0].rows).toEqual([{ count: "42" }]);
    expect(r.model).toBe("sonnet");
  });

  it("surfaces a guard rejection as a recoverable tool error", async () => {
    __setAssistantAnthropicForTesting(
      fakeClient([
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "query_database",
              input: { sql: "DELETE FROM \"order\"" },
            },
          ],
        },
        {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "I can only read data, not modify it." }],
        },
      ]),
    );

    const r = await runAssistantTurn({
      messages: [{ role: "user", content: "delete all orders" }],
      model: "opus",
    });

    expect(r.steps[0].ok).toBe(false);
    expect(r.steps[0].error).toMatch(/read-only/i);
    expect(r.answer).toMatch(/read/i);
    expect(r.model).toBe("opus");
  });
});
