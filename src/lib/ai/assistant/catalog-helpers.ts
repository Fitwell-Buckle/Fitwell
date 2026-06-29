import type { AssistantStep } from "./tools";

/**
 * Pure helpers for persisting conversations + building the query catalog.
 * Kept free of DB/IO so they're trivially unit-testable.
 */

export const ASSISTANT_CATEGORIES = [
  "revenue",
  "customers",
  "production",
  "crm",
  "margin",
  "funnel",
  "marketing",
  "other",
] as const;

export type AssistantCategory = (typeof ASSISTANT_CATEGORIES)[number];

export function normalizeCategory(value: unknown): AssistantCategory {
  if (typeof value === "string") {
    const v = value.toLowerCase().trim();
    if ((ASSISTANT_CATEGORIES as readonly string[]).includes(v)) {
      return v as AssistantCategory;
    }
  }
  return "other";
}

// A short title for the history list, from the first user question.
export function deriveTitle(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  if (clean.length <= 60) return clean;
  return clean.slice(0, 59).trimEnd() + "…";
}

/**
 * Best-effort extraction of the tables a SQL query references, by scanning for
 * identifiers after FROM / JOIN. Used for the catalog's "hot tables" rollup —
 * approximate is fine. Skips subqueries (`FROM (`).
 */
export function parseTablesTouched(sqlText: string): string[] {
  const out = new Set<string>();
  const re = /\b(?:from|join)\s+("?[a-zA-Z_][\w".$]*"?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sqlText)) !== null) {
    let ident = m[1];
    if (ident.startsWith("(")) continue;
    // strip quotes, drop schema qualifier (public.order -> order)
    ident = ident.replace(/"/g, "");
    const parts = ident.split(".");
    const name = parts[parts.length - 1].toLowerCase();
    if (name) out.add(name);
  }
  return [...out];
}

// Cap rows stored per step so the replay snapshot stays small.
const MAX_STORED_ROWS = 30;

export function trimStepsForStorage(steps: AssistantStep[]): AssistantStep[] {
  return steps.map((s) => ({
    ...s,
    rows: s.rows ? s.rows.slice(0, MAX_STORED_ROWS) : s.rows,
  }));
}
