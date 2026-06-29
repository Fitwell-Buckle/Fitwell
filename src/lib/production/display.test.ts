import { describe, it, expect } from "vitest";
import { isOpenPoStatus } from "./display";

describe("isOpenPoStatus", () => {
  it("treats active and on_hold as open (always shown on the board)", () => {
    expect(isOpenPoStatus("active")).toBe(true);
    expect(isOpenPoStatus("on_hold")).toBe(true);
  });

  it("treats complete and cancelled as not-open (date-filtered / hidden)", () => {
    expect(isOpenPoStatus("complete")).toBe(false);
    expect(isOpenPoStatus("cancelled")).toBe(false);
  });
});
