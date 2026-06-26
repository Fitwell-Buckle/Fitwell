import { describe, it, expect } from "vitest";
import { riskTone, formatPct } from "./return-drivers-format";

describe("riskTone", () => {
  const base = 4.3;

  it("flags high at >=1.5x baseline", () => {
    expect(riskTone(7.2, base, 444)).toBe("high"); // M4 link
    expect(riskTone(6.45, base, 100)).toBe("high");
  });

  it("flags elevated between 1.15x and 1.5x", () => {
    expect(riskTone(5.2, base, 906)).toBe("elevated"); // 18mm
  });

  it("flags low at <=0.6x baseline", () => {
    expect(riskTone(2.3, base, 394)).toBe("low"); // direct traffic
  });

  it("is neutral near baseline", () => {
    expect(riskTone(4.4, base, 1963)).toBe("neutral"); // silver
  });

  it("forces neutral on thin samples (below minUnits) regardless of pct", () => {
    expect(riskTone(100, base, 5)).toBe("neutral");
    expect(riskTone(50, base, 24)).toBe("neutral"); // 24 < 25 threshold
  });

  it("does flag a sample at/above the threshold", () => {
    expect(riskTone(9.4, base, 32)).toBe("high"); // 22mm, n=32 >= 25
  });

  it("is neutral when baseline is zero", () => {
    expect(riskTone(5, 0, 1000)).toBe("neutral");
  });
});

describe("formatPct", () => {
  it("formats to one decimal with a percent sign", () => {
    expect(formatPct(4.3)).toBe("4.3%");
    expect(formatPct(10)).toBe("10.0%");
  });
});
