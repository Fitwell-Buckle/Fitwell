import { describe, it, expect } from "vitest";
import {
  aggregateFirstOrderDiscountSplit,
  classifyDiscountCode,
  normalizeDiscountCode,
} from "@/lib/discount-codes";

describe("normalizeDiscountCode", () => {
  it("lowercases and trims", () => {
    expect(normalizeDiscountCode("  WatchBros15 ")).toBe("watchbros15");
  });
});

describe("classifyDiscountCode", () => {
  it("classifies JM- and review- codes as review regardless of casing", () => {
    expect(classifyDiscountCode("JM-AB12CD3")).toEqual({ family: "review" });
    expect(classifyDiscountCode("jm-xyz9876")).toEqual({ family: "review" });
    expect(classifyDiscountCode("review-3z3xxx8")).toEqual({
      family: "review",
    });
  });

  it("classifies the pinned welcome code", () => {
    expect(classifyDiscountCode("WELCOME15")).toEqual({ family: "welcome" });
  });

  it("classifies CS make-goods and manual discounts as service", () => {
    expect(classifyDiscountCode("mispack100")).toEqual({ family: "service" });
    expect(classifyDiscountCode("Custom Discount")).toEqual({
      family: "service",
    });
  });

  it("classifies in-person event codes as event", () => {
    expect(classifyDiscountCode("SF15")).toEqual({ family: "event" });
    expect(classifyDiscountCode("geneva15")).toEqual({ family: "event" });
  });

  it("classifies known creator prefixes as creator with the slug", () => {
    expect(classifyDiscountCode("watchbros15")).toEqual({
      family: "creator",
      creatorSlug: "watchbros",
    });
    expect(classifyDiscountCode("WATCHCHRIS20")).toEqual({
      family: "creator",
      creatorSlug: "watchchris",
    });
  });

  it("classifies welcome codes by exact normalized match", () => {
    const welcomeCodes = new Set(["welcome15"]);
    expect(classifyDiscountCode(" WELCOME15 ", { welcomeCodes })).toEqual({
      family: "welcome",
    });
    // Welcome wins over a creator prefix collision
    expect(
      classifyDiscountCode("watchbros15", {
        welcomeCodes: new Set(["watchbros15"]),
      }),
    ).toEqual({ family: "welcome" });
  });

  it("falls back to other for unknown codes", () => {
    expect(classifyDiscountCode("SUMMER-SALE")).toEqual({ family: "other" });
    expect(classifyDiscountCode("")).toEqual({ family: "other" });
  });

  it("does not match jm- in the middle of a code", () => {
    expect(classifyDiscountCode("teamjm-10")).toEqual({ family: "other" });
  });
});

describe("aggregateFirstOrderDiscountSplit", () => {
  it("counts no-code orders and splits coded orders by family", () => {
    const split = aggregateFirstOrderDiscountSplit([
      { orderId: "a", code: null, amountCents: null },
      { orderId: "b", code: "welcome15", amountCents: 600 },
      { orderId: "c", code: "watchbros15", amountCents: 550 },
      { orderId: "d", code: "watchchris20", amountCents: 800 },
      { orderId: "e", code: "sf15", amountCents: 600 },
    ]);
    expect(split.totalFirstOrders).toBe(5);
    expect(split.noCode).toBe(1);
    expect(split.withCode).toBe(4);

    const creator = split.families.find((f) => f.family === "creator");
    expect(creator?.orders).toBe(2);
    expect(creator?.pctOfFirstOrders).toBe(40);
    expect(creator?.discountCents).toBe(1350);
    expect(creator?.creators).toEqual([
      { slug: "watchbros", orders: 1 },
      { slug: "watchchris", orders: 1 },
    ]);
    expect(split.families.find((f) => f.family === "event")?.orders).toBe(1);
  });

  it("counts a multi-code order once, under the highest-priority family", () => {
    const split = aggregateFirstOrderDiscountSplit([
      { orderId: "a", code: "welcome15", amountCents: 600 },
      { orderId: "a", code: "watchbros15", amountCents: 200 },
    ]);
    expect(split.totalFirstOrders).toBe(1);
    expect(split.families).toHaveLength(1);
    expect(split.families[0].family).toBe("creator"); // creator outranks welcome
    expect(split.families[0].discountCents).toBe(800); // both codes' cents
  });

  it("handles an empty window", () => {
    const split = aggregateFirstOrderDiscountSplit([]);
    expect(split.totalFirstOrders).toBe(0);
    expect(split.families).toEqual([]);
  });
});
