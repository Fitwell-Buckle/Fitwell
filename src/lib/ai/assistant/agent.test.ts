import { describe, it, expect, afterEach } from "vitest";
import { runAssistantTurn } from "./agent";
import { __setAssistantAnthropicForTesting } from "./client";
import { __setReadOnlyExecutorForTesting } from "./readonly-db";
import { __setHogQLExecutorForTesting } from "./posthog";

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
  __setHogQLExecutorForTesting(null);
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

  it("routes a PostHog question and tags the step source=posthog", async () => {
    __setHogQLExecutorForTesting(async () => ({
      columns: ["non_buyers"],
      results: [[3120]],
    }));
    __setAssistantAnthropicForTesting(
      fakeClient([
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "query_posthog",
              input: {
                query:
                  "SELECT count() FROM (SELECT person_id FROM events GROUP BY person_id)",
                category: "funnel",
              },
            },
          ],
        },
        {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "About 3,120 people visited but didn't purchase (PostHog persons).",
            },
          ],
        },
      ]),
    );

    const r = await runAssistantTurn({
      messages: [
        { role: "user", content: "how many people visited but didn't buy?" },
      ],
    });

    expect(r.answer).toMatch(/3,120|3120/);
    expect(r.steps[0].tool).toBe("query_posthog");
    expect(r.steps[0].source).toBe("posthog");
    expect(r.steps[0].rows).toEqual([{ non_buyers: 3120 }]);
  });

  it("captures a render_chart step's validated spec on the turn", async () => {
    __setReadOnlyExecutorForTesting(async () => ({
      rows: [
        { month: "Mar", revenue: "1000" },
        { month: "Apr", revenue: "2000" },
      ],
      fields: [{ name: "month" }, { name: "revenue" }],
    }));
    __setAssistantAnthropicForTesting(
      fakeClient([
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "q1",
              name: "query_database",
              input: { sql: "SELECT month, revenue FROM x" },
            },
          ],
        },
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "c1",
              name: "render_chart",
              input: {
                type: "bar",
                title: "Revenue by month",
                xKey: "month",
                series: [{ key: "revenue" }],
                data: [
                  { month: "Mar", revenue: "1000" },
                  { month: "Apr", revenue: "2000" },
                ],
              },
            },
          ],
        },
        {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Revenue doubled from Mar to Apr." }],
        },
      ]),
    );

    const r = await runAssistantTurn({
      messages: [{ role: "user", content: "show revenue by month" }],
    });

    const chartStep = r.steps.find((s) => s.tool === "render_chart");
    expect(chartStep?.chart?.type).toBe("bar");
    expect(chartStep?.chart?.data[1]).toEqual({ month: "Apr", revenue: 2000 });
    expect(r.answer).toMatch(/doubled/);
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
