import { describe, it, expect } from "vitest";
import {
  deriveTitle,
  normalizeCategory,
  parseTablesTouched,
  trimStepsForStorage,
} from "./catalog-helpers";
import type { AssistantStep } from "./tools";

describe("normalizeCategory", () => {
  it("accepts known categories case-insensitively", () => {
    expect(normalizeCategory("Revenue")).toBe("revenue");
    expect(normalizeCategory("production")).toBe("production");
  });
  it("falls back to 'other' for unknown/missing", () => {
    expect(normalizeCategory("widgets")).toBe("other");
    expect(normalizeCategory(undefined)).toBe("other");
    expect(normalizeCategory(42)).toBe("other");
  });
});

describe("deriveTitle", () => {
  it("collapses whitespace and keeps short questions whole", () => {
    expect(deriveTitle("  How   many  orders? ")).toBe("How many orders?");
  });
  it("truncates long questions with an ellipsis", () => {
    const t = deriveTitle("a".repeat(100));
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("parseTablesTouched", () => {
  it("extracts table names from FROM and JOIN", () => {
    const sql =
      'SELECT * FROM "order" o JOIN customer c ON c.id = o.customer_id';
    expect(parseTablesTouched(sql).sort()).toEqual(["customer", "order"]);
  });
  it("drops schema qualifiers and dedupes", () => {
    const sql = "SELECT 1 FROM public.order, order";
    expect(parseTablesTouched(sql)).toEqual(["order"]);
  });
  it("skips subqueries", () => {
    const sql = "SELECT * FROM (SELECT 1) t JOIN customer ON true";
    expect(parseTablesTouched(sql)).toEqual(["customer"]);
  });
});

describe("trimStepsForStorage", () => {
  it("caps stored rows per step", () => {
    const step: AssistantStep = {
      tool: "query_database",
      input: {},
      ok: true,
      rows: Array.from({ length: 100 }, (_, i) => ({ i })),
    };
    const [out] = trimStepsForStorage([step]);
    expect(out.rows?.length).toBe(30);
  });
  it("leaves stepless entries untouched", () => {
    const step: AssistantStep = { tool: "list_tables", input: {}, ok: true };
    expect(trimStepsForStorage([step])[0].rows).toBeUndefined();
  });
});
