import { describe, expect, it } from "vitest";
import { followupSubject } from "./sent-followups-subject";

describe("followupSubject", () => {
  it("prefixes Re: on a plain subject", () => {
    expect(followupSubject("Samples for your line", "x")).toBe(
      "Re: Samples for your line",
    );
  });
  it("doesn't double-prefix an existing Re:", () => {
    expect(followupSubject("Re: Samples", "x")).toBe("Re: Samples");
    expect(followupSubject("RE: Samples", "x")).toBe("RE: Samples");
  });
  it("falls back when there's no original subject", () => {
    expect(followupSubject(null, "Following up")).toBe("Following up");
    expect(followupSubject("  ", "Following up")).toBe("Following up");
  });
});
