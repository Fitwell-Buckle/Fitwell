import { describe, it, expect } from "vitest";
import { validateStageEventDate, dateToNoonUtc } from "@/lib/production/stage-dates";

const day = (s: string) => dateToNoonUtc(s).getTime();

describe("validateStageEventDate", () => {
  it("accepts a date between its neighbours", () => {
    expect(
      validateStageEventDate({
        newEnteredMs: day("2026-05-10"),
        prevEnteredMs: day("2026-05-08"),
        nextEnteredMs: day("2026-05-12"),
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a date before the previous stage", () => {
    const r = validateStageEventDate({
      newEnteredMs: day("2026-05-07"),
      prevEnteredMs: day("2026-05-08"),
      nextEnteredMs: day("2026-05-12"),
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a date after the next stage", () => {
    const r = validateStageEventDate({
      newEnteredMs: day("2026-05-13"),
      prevEnteredMs: day("2026-05-08"),
      nextEnteredMs: day("2026-05-12"),
    });
    expect(r.ok).toBe(false);
  });

  it("allows equality with a neighbour (same-day transition)", () => {
    expect(
      validateStageEventDate({
        newEnteredMs: day("2026-05-08"),
        prevEnteredMs: day("2026-05-08"),
        nextEnteredMs: day("2026-05-12"),
      }).ok,
    ).toBe(true);
    expect(
      validateStageEventDate({
        newEnteredMs: day("2026-05-12"),
        prevEnteredMs: day("2026-05-08"),
        nextEnteredMs: day("2026-05-12"),
      }).ok,
    ).toBe(true);
  });

  it("is unbounded when a neighbour is missing (first/last stage)", () => {
    expect(
      validateStageEventDate({
        newEnteredMs: day("2020-01-01"),
        prevEnteredMs: null,
        nextEnteredMs: day("2026-05-12"),
      }).ok,
    ).toBe(true);
    expect(
      validateStageEventDate({
        newEnteredMs: day("2099-01-01"),
        prevEnteredMs: day("2026-05-08"),
        nextEnteredMs: null,
      }).ok,
    ).toBe(true);
  });
});

describe("dateToNoonUtc", () => {
  it("anchors a YYYY-MM-DD to noon UTC", () => {
    expect(dateToNoonUtc("2026-05-10").toISOString()).toBe("2026-05-10T12:00:00.000Z");
  });
});
