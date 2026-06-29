import { runReadOnlyQuery } from "./readonly-db";

/**
 * Schema introspection for the assistant. The DB is ~90 tables, so we let the
 * model pull table/column definitions ON DEMAND (via the list_tables /
 * describe_schema tools) instead of dumping the whole schema into context.
 *
 * NextAuth secret-bearing tables are filtered out here as defense-in-depth;
 * the read-only role's grants are the real exclusion (it should not be granted
 * SELECT on these at all).
 */

const SENSITIVE_TABLES = new Set([
  "account",
  "session",
  "verificationToken",
  "verification_token",
  "authenticator",
]);

export interface TableInfo {
  table: string;
}

export interface ColumnInfo {
  column: string;
  type: string;
  nullable: boolean;
}

export async function listTables(): Promise<string[]> {
  const res = await runReadOnlyQuery(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    5000,
  );
  return res.rows
    .map((r) => String(r.table_name))
    .filter((t) => !SENSITIVE_TABLES.has(t));
}

export async function describeTable(table: string): Promise<ColumnInfo[]> {
  // Only allow plain identifiers to avoid any injection via the table name.
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  if (SENSITIVE_TABLES.has(table)) {
    throw new Error(`Table '${table}' is not available to the assistant.`);
  }

  const res = await runReadOnlyQuery(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table}'
     ORDER BY ordinal_position`,
    500,
  );

  if (res.rows.length === 0) {
    throw new Error(`No such table: ${table}`);
  }

  return res.rows.map((r) => ({
    column: String(r.column_name),
    type: String(r.data_type),
    nullable: String(r.is_nullable).toUpperCase() === "YES",
  }));
}
