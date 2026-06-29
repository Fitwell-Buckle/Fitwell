import Anthropic from "@anthropic-ai/sdk";
import { listTables, describeTable } from "./schema-catalog";
import { runReadOnlyQuery } from "./readonly-db";
import { runAssistantHogQL } from "./posthog";
import { parseTablesTouched } from "./catalog-helpers";

/**
 * Tool definitions exposed to the model, plus the dispatcher that executes
 * them. Each execution returns BOTH the text fed back to the model and a
 * structured `AssistantStep` the UI renders (so the user sees the exact SQL
 * and rows behind every answer).
 */

export interface AssistantStep {
  tool: string;
  input: unknown;
  ok: boolean;
  error?: string;
  // query_database only:
  sql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  // Catalog metadata (query_database only):
  source?: "postgres" | "posthog" | "cogs";
  category?: string;
  tablesTouched?: string[];
  durationMs?: number;
}

// How many result rows to feed back to the model (the UI keeps the full set).
const ROWS_TO_MODEL = 50;

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_tables",
    description:
      "List the names of all queryable tables in the database. Call this first " +
      "when you don't already know which table holds the data you need.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "describe_schema",
    description:
      "Return the columns (name, type, nullable) of a single table. Call this " +
      "before writing SQL against a table so you use real column names.",
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Exact table name." },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "query_database",
    description:
      "Run a single read-only SELECT (or WITH … SELECT) against Postgres and " +
      "return the rows. Money columns are integer cents. Writes are impossible " +
      "(read-only role); attempting one returns an error.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "A single read-only SELECT statement." },
        purpose: {
          type: "string",
          description: "One short line on what this query is for (for the log).",
        },
        category: {
          type: "string",
          enum: [
            "revenue",
            "customers",
            "production",
            "crm",
            "margin",
            "funnel",
            "marketing",
            "other",
          ],
          description:
            "Best-fit category for this query — used to learn what questions " +
            "get asked most. Pick the closest.",
        },
      },
      required: ["sql"],
      additionalProperties: false,
    },
  },
  {
    name: "query_posthog",
    description:
      "Run a read-only HogQL query against PostHog for PERSON-LEVEL web " +
      "analytics that are NOT in Postgres — who visited, funnel drop-off, " +
      "entry pages, 'visited but didn't buy'. Query the `events` table; key " +
      "events: $pageview, product_viewed, product_added_to_cart, " +
      "checkout_started, purchase_completed. PostHog counts PEOPLE (person_id), " +
      "which differs from Postgres order counts and GA4 sessions — say which.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A read-only HogQL SELECT query." },
        purpose: {
          type: "string",
          description: "One short line on what this query is for (for the log).",
        },
        category: {
          type: "string",
          enum: [
            "revenue",
            "customers",
            "production",
            "crm",
            "margin",
            "funnel",
            "marketing",
            "other",
          ],
          description: "Best-fit category (usually 'funnel' or 'marketing').",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

export async function executeTool(
  name: string,
  input: unknown,
): Promise<{ resultText: string; step: AssistantStep }> {
  try {
    if (name === "list_tables") {
      const tables = await listTables();
      return {
        resultText: JSON.stringify(tables),
        step: { tool: name, input, ok: true },
      };
    }

    if (name === "describe_schema") {
      const table = String(asRecord(input).table ?? "");
      const cols = await describeTable(table);
      return {
        resultText: JSON.stringify(cols),
        step: { tool: name, input, ok: true },
      };
    }

    if (name === "query_database") {
      const sql = String(asRecord(input).sql ?? "");
      const category = asRecord(input).category;
      const started = Date.now();
      const r = await runReadOnlyQuery(sql);
      const durationMs = Date.now() - started;
      const forModel = {
        sql: r.sql,
        columns: r.columns,
        rowCount: r.rowCount,
        truncated: r.truncated,
        rows: r.rows.slice(0, ROWS_TO_MODEL),
      };
      return {
        resultText: JSON.stringify(forModel),
        step: {
          tool: name,
          input,
          ok: true,
          sql: r.sql,
          columns: r.columns,
          rows: r.rows,
          rowCount: r.rowCount,
          truncated: r.truncated,
          source: "postgres",
          category: typeof category === "string" ? category : undefined,
          tablesTouched: parseTablesTouched(r.sql),
          durationMs,
        },
      };
    }

    if (name === "query_posthog") {
      const query = String(asRecord(input).query ?? "");
      const category = asRecord(input).category;
      const started = Date.now();
      const r = await runAssistantHogQL(query);
      const durationMs = Date.now() - started;
      const forModel = {
        query: r.query,
        columns: r.columns,
        rowCount: r.rowCount,
        truncated: r.truncated,
        rows: r.rows.slice(0, ROWS_TO_MODEL),
      };
      return {
        resultText: JSON.stringify(forModel),
        step: {
          tool: name,
          input,
          ok: true,
          sql: r.query,
          columns: r.columns,
          rows: r.rows,
          rowCount: r.rowCount,
          truncated: r.truncated,
          source: "posthog",
          category: typeof category === "string" ? category : undefined,
          tablesTouched: ["posthog:events"],
          durationMs,
        },
      };
    }

    return {
      resultText: `ERROR: unknown tool '${name}'`,
      step: { tool: name, input, ok: false, error: `unknown tool '${name}'` },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      resultText: `ERROR: ${msg}`,
      step: { tool: name, input, ok: false, error: msg },
    };
  }
}
