/**
 * Live HogQL access for the assistant — person-level web analytics that don't
 * live in Postgres (who visited, funnel drop-off, entry pages, visited-but-
 * didn't-buy). HogQL against the PostHog query API is inherently read-only.
 *
 * Mirrors the fetch in src/lib/admin/funnel.ts but also captures the response
 * `columns` so results can be rendered as named columns. Injectable executor
 * for unit testing.
 */

export interface HogQLQueryResult {
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

type HogQLExecutor = (
  query: string,
) => Promise<{ columns: string[]; results: unknown[][] }>;

const DEFAULT_MAX_ROWS = 1000;

let executorOverride: HogQLExecutor | null = null;

// Test seam: inject a fake HogQL executor (no network).
export function __setHogQLExecutorForTesting(e: HogQLExecutor | null): void {
  executorOverride = e;
}

function defaultExecutor(): HogQLExecutor {
  return async (query: string) => {
    const projectId = process.env.POSTHOG_PROJECT_ID;
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    if (!projectId || !apiKey) {
      throw new Error(
        "PostHog query needs POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY",
      );
    }
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if (!res.ok) {
      throw new Error(`PostHog query API ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      columns?: string[];
      results?: unknown[][];
    };
    return { columns: json.columns ?? [], results: json.results ?? [] };
  };
}

export async function runAssistantHogQL(
  query: string,
  maxRows: number = DEFAULT_MAX_ROWS,
): Promise<HogQLQueryResult> {
  const exec = executorOverride ?? defaultExecutor();
  const { columns, results } = await exec(query);

  const cols = columns.map(String);
  const limited = results.slice(0, maxRows);
  // HogQL returns array-rows; key them by column name for uniform rendering.
  const rows = limited.map((r) => {
    const obj: Record<string, unknown> = {};
    if (Array.isArray(r)) {
      r.forEach((v, i) => {
        obj[cols[i] ?? `col${i}`] = v;
      });
    }
    return obj;
  });

  return {
    query,
    columns: cols,
    rows,
    rowCount: rows.length,
    truncated: results.length > maxRows,
  };
}
