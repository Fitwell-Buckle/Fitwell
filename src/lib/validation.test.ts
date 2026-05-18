import { describe, it, expect } from "vitest";
import {
  paginationSchema,
  dateRangeSchema,
  customerFiltersSchema,
} from "@/lib/validation";

describe("paginationSchema", () => {
  it("applies defaults when empty", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it("coerces string query params to numbers", () => {
    expect(paginationSchema.parse({ page: "3", limit: "50" })).toEqual({
      page: 3,
      limit: 50,
    });
  });

  it("rejects page below 1", () => {
    expect(paginationSchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects limit above 100", () => {
    expect(paginationSchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects non-integer page", () => {
    expect(paginationSchema.safeParse({ page: "2.5" }).success).toBe(false);
  });
});

describe("dateRangeSchema", () => {
  it("treats from/to as optional", () => {
    expect(dateRangeSchema.parse({})).toEqual({});
  });

  it("coerces ISO strings to Date", () => {
    const r = dateRangeSchema.parse({ from: "2026-01-01" });
    expect(r.from).toBeInstanceOf(Date);
  });
});

describe("customerFiltersSchema", () => {
  it("passes through optional string filters", () => {
    expect(
      customerFiltersSchema.parse({ search: "ada", tag: "vip" }),
    ).toEqual({ search: "ada", tag: "vip" });
  });

  it("coerces spend bounds to integers", () => {
    expect(customerFiltersSchema.parse({ minSpent: "5000" }).minSpent).toBe(
      5000,
    );
  });

  it("rejects a non-integer spend bound", () => {
    expect(
      customerFiltersSchema.safeParse({ maxSpent: "12.5" }).success,
    ).toBe(false);
  });
});
