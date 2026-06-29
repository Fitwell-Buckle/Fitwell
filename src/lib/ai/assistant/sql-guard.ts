/**
 * SQL safety guard for the portal AI assistant.
 *
 * This is DEFENSE-IN-DEPTH, layered on top of the real guarantee: the
 * assistant connects through a dedicated read-only Postgres role
 * (`DATABASE_URL_READONLY`) that lacks INSERT/UPDATE/DELETE/DDL grants, so
 * a write is rejected by the database itself regardless of what the model
 * emits. This guard catches obvious mistakes earlier (clearer error to the
 * model so it can self-correct) and enforces a row cap.
 *
 * Rules:
 *  - single statement only (no `;` separating statements)
 *  - must begin with SELECT or WITH (read shapes only)
 *  - blocklist of clear write/DDL/side-effecting tokens
 *  - an outer LIMIT is injected when the query has none
 */

export const DEFAULT_MAX_ROWS = 1000;

// Clear write / DDL / filesystem / side-effecting tokens. Chosen to avoid
// colliding with common column names (e.g. `created_at`, `updated_at`,
// `deleted_at` don't match these word-boundary patterns). The read-only role
// is the real lock; this is an early, friendlier rejection.
const FORBIDDEN =
  /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|vacuum|reindex|into|returning|lo_import|lo_export|pg_read_file|pg_ls_dir|pg_sleep|dblink|copy)\b/i;

export type GuardResult =
  | { ok: true; sql: string; limitInjected: boolean }
  | { ok: false; error: string };

function stripComments(sql: string): string {
  // Remove block comments /* ... */ and line comments -- ... so a comment
  // can't smuggle a second statement or a forbidden token past the checks.
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

export function validateReadOnlySql(
  raw: string,
  maxRows: number = DEFAULT_MAX_ROWS,
): GuardResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Empty query." };
  }

  // Work on a comment-stripped copy for the safety checks, but preserve the
  // original text (minus a trailing semicolon) for execution.
  const stripped = stripComments(raw).trim();
  let exec = raw.trim();
  if (exec.endsWith(";")) exec = exec.slice(0, -1).trim();
  const strippedNoTrailing = stripped.endsWith(";")
    ? stripped.slice(0, -1).trim()
    : stripped;

  if (strippedNoTrailing === "") {
    return { ok: false, error: "Query is only comments." };
  }

  // Multi-statement: any remaining semicolon after dropping the trailing one.
  if (strippedNoTrailing.includes(";")) {
    return {
      ok: false,
      error: "Only a single statement is allowed (found ';').",
    };
  }

  const leading = strippedNoTrailing.match(/^[a-z]+/i)?.[0]?.toLowerCase();
  if (leading !== "select" && leading !== "with") {
    return {
      ok: false,
      error: "Only read-only SELECT (or WITH … SELECT) queries are allowed.",
    };
  }

  const forbidden = strippedNoTrailing.match(FORBIDDEN);
  if (forbidden) {
    return {
      ok: false,
      error: `Disallowed keyword '${forbidden[0]}' — this assistant is read-only.`,
    };
  }

  // Inject an outer LIMIT when the query has none, to bound result size.
  const hasLimit = /\blimit\b/i.test(strippedNoTrailing);
  const sql = hasLimit ? exec : `${exec}\nLIMIT ${maxRows}`;

  return { ok: true, sql, limitInjected: !hasLimit };
}
