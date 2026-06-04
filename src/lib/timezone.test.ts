import { describe, it, expect } from "vitest";
import {
  STORE_TZ,
  formatInStoreTz,
  shiftDate,
  storeDayStartUtc,
  storeDayEndUtc,
  storeToday,
} from "@/lib/timezone";

describe("timezone helpers", () => {
  it("uses Pacific as the store timezone", () => {
    expect(STORE_TZ).toBe("America/Los_Angeles");
  });

  it("formatInStoreTz renders the store-local calendar date", () => {
    // 02:46Z on Jun 4 is still 19:46 PDT on Jun 3 — the evening-rollover case.
    expect(formatInStoreTz(new Date("2026-06-04T02:46:00Z"))).toBe("2026-06-03");
    // 07:30Z on Jun 4 is 00:30 PDT on Jun 4.
    expect(formatInStoreTz(new Date("2026-06-04T07:30:00Z"))).toBe("2026-06-04");
  });

  it("maps PDT (summer) midnight to 07:00 UTC", () => {
    expect(storeDayStartUtc("2026-06-03").toISOString()).toBe(
      "2026-06-03T07:00:00.000Z",
    );
  });

  it("maps PST (winter) midnight to 08:00 UTC", () => {
    expect(storeDayStartUtc("2026-01-15").toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
  });

  it("storeDayEndUtc is the last millisecond of the store-local day", () => {
    expect(storeDayEndUtc("2026-06-03").toISOString()).toBe(
      "2026-06-04T06:59:59.999Z",
    );
  });

  it("shiftDate moves whole calendar days across month boundaries", () => {
    expect(shiftDate("2026-06-03", -7)).toBe("2026-05-27");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("storeToday derives the store-local date for a given instant", () => {
    expect(storeToday(new Date("2026-06-04T02:46:00Z"))).toBe("2026-06-03");
  });
});
