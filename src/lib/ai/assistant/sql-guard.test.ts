import { describe, it, expect } from "vitest";
import { validateReadOnlySql, DEFAULT_MAX_ROWS } from "./sql-guard";

describe("validateReadOnlySql", () => {
  it("accepts a simple SELECT and injects a LIMIT", () => {
    const r = validateReadOnlySql("SELECT count(*) FROM order");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.limitInjected).toBe(true);
      expect(r.sql).toMatch(new RegExp(`LIMIT ${DEFAULT_MAX_ROWS}`));
    }
  });

  it("accepts a WITH … SELECT (CTE)", () => {
    const r = validateReadOnlySql(
      "WITH t AS (SELECT id FROM order) SELECT count(*) FROM t",
    );
    expect(r.ok).toBe(true);
  });

  it("does not double-inject when a LIMIT is already present", () => {
    const r = validateReadOnlySql("SELECT id FROM customer LIMIT 5");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.limitInjected).toBe(false);
      expect(r.sql.match(/limit/gi)?.length).toBe(1);
    }
  });

  it("does not trip on column names containing keyword substrings", () => {
    // created_at / updated_at / deleted_at must not match create/update/delete.
    const r = validateReadOnlySql(
      "SELECT created_at, updated_at, deleted_at FROM order",
    );
    expect(r.ok).toBe(true);
  });

  for (const bad of [
    "INSERT INTO order (id) VALUES (1)",
    "UPDATE order SET total_price = 0",
    "DELETE FROM order",
    "DROP TABLE order",
    "TRUNCATE order",
    "ALTER TABLE order ADD COLUMN x int",
    "CREATE TABLE evil (id int)",
    "GRANT ALL ON order TO public",
    "SELECT * INTO evil FROM order",
  ]) {
    it(`rejects: ${bad}`, () => {
      const r = validateReadOnlySql(bad);
      expect(r.ok).toBe(false);
    });
  }

  it("rejects multiple statements", () => {
    const r = validateReadOnlySql("SELECT 1; DROP TABLE order");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/single statement/i);
  });

  it("rejects a statement hidden behind a comment", () => {
    const r = validateReadOnlySql("SELECT 1 -- ;\n; DROP TABLE order");
    expect(r.ok).toBe(false);
  });

  it("rejects a forbidden token smuggled in a block comment then statement", () => {
    const r = validateReadOnlySql("/* DELETE */ SELECT 1; DELETE FROM order");
    expect(r.ok).toBe(false);
  });

  it("rejects empty / comment-only input", () => {
    expect(validateReadOnlySql("").ok).toBe(false);
    expect(validateReadOnlySql("   ").ok).toBe(false);
    expect(validateReadOnlySql("-- just a comment").ok).toBe(false);
  });

  it("rejects a non-SELECT leading keyword", () => {
    expect(validateReadOnlySql("EXPLAIN SELECT 1").ok).toBe(false);
    expect(validateReadOnlySql("SET statement_timeout = 0").ok).toBe(false);
  });
});
