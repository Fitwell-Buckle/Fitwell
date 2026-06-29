import { neon } from "@neondatabase/serverless";
import { validateReadOnlySql, DEFAULT_MAX_ROWS } from "./sql-guard";

/**
 * Executes model-generated SQL against Neon through the dedicated read-only
 * role (`DATABASE_URL_READONLY`). Every query passes the SQL guard first, then
 * runs as a role that physically cannot write. Returns columns + rows in a
 * shape the agent can hand back to the model and the UI can render.
 */

export interface ReadOnlyQueryResult {
  sql: string; // the exact SQL run (post-guard, may include an injected LIMIT)
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

type Executor = (
  sql: string,
) => Promise<{ rows: Record<string, unknown>[]; fields: { name: string }[] }>;

let executorOverride: Executor | null = null;

// Test seam: inject a fake executor so the wrapper (validation + shaping) can
// be unit-tested without a database.
export function __setReadOnlyExecutorForTesting(e: Executor | null): void {
  executorOverride = e;
}

let cachedExecutor: Executor | null = null;

function defaultExecutor(): Executor {
  if (!cachedExecutor) {
    const url = process.env.DATABASE_URL_READONLY;
    if (!url) {
      throw new Error(
        "DATABASE_URL_READONLY is not set. The assistant requires a dedicated " +
          "read-only Postgres role — see scripts/create-readonly-role.sql.",
      );
    }
    const sql = neon(url, { fullResults: true });
    cachedExecutor = async (text: string) => {
      // Ordinary (non-template) call: pass the SQL string directly. With
      // fullResults the response carries `rows` and `fields`.
      const res = (await sql(text)) as unknown as {
        rows: Record<string, unknown>[];
        fields: { name: string }[];
      };
      return { rows: res.rows ?? [], fields: res.fields ?? [] };
    };
  }
  return cachedExecutor;
}

export async function runReadOnlyQuery(
  rawSql: string,
  maxRows: number = DEFAULT_MAX_ROWS,
): Promise<ReadOnlyQueryResult> {
  const guard = validateReadOnlySql(rawSql, maxRows);
  if (!guard.ok) {
    throw new Error(guard.error);
  }

  const exec = executorOverride ?? defaultExecutor();
  const { rows, fields } = await exec(guard.sql);

  const columns =
    fields.length > 0
      ? fields.map((f) => f.name)
      : rows[0]
        ? Object.keys(rows[0])
        : [];

  return {
    sql: guard.sql,
    columns,
    rows,
    rowCount: rows.length,
    truncated: rows.length >= maxRows,
  };
}
