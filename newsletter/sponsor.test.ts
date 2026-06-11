import { describe, expect, it } from "vitest";
import {
  SPONSOR_MODULES,
  pickSponsorModule,
  sponsorHref,
} from "./sponsor";

describe("sponsor module registry", () => {
  it("has unique ids and complete copy", () => {
    const ids = SPONSOR_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of SPONSOR_MODULES) {
      expect(m.headline.length, m.id).toBeGreaterThan(0);
      expect(m.body.length, m.id).toBeGreaterThan(0);
      expect(m.ctaLabel.length, m.id).toBeGreaterThan(0);
      expect(m.ctaUrl, m.id).toMatch(/^https:\/\/www\.fitwellbuckle\.co/);
    }
  });

  it("points B2B modules at OEM services, D2C at the shop", () => {
    const byId = new Map(SPONSOR_MODULES.map((m) => [m.id, m]));
    expect(byId.get("spec")!.ctaUrl).toContain("/pages/oe-services");
    expect(byId.get("partner")!.ctaUrl).toContain("/pages/oe-services");
    expect(byId.get("detail")!.ctaUrl).toContain("/pages/oe-services");
    expect(byId.get("outfit")!.ctaUrl).toBe("https://www.fitwellbuckle.co");
    expect(byId.get("punch")!.ctaUrl).toBe("https://www.fitwellbuckle.co");
  });
});

describe("pickSponsorModule", () => {
  it("is deterministic for a given date", () => {
    const d = new Date("2026-06-11T09:00:00Z");
    expect(pickSponsorModule(d).id).toBe(pickSponsorModule(d).id);
  });

  it("cycles through every module over consecutive weekdays", () => {
    const seen = new Set<string>();
    let d = new Date("2026-06-08T09:00:00Z"); // a Monday
    let count = 0;
    while (count < SPONSOR_MODULES.length) {
      const dow = d.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        seen.add(pickSponsorModule(d).id);
        count++;
      }
      d = new Date(d.getTime() + 86_400_000);
    }
    expect(seen.size).toBe(SPONSOR_MODULES.length); // each appears once per cycle
  });

  it("advances exactly one slot per weekday issue (incl. across a weekend)", () => {
    const thu = new Date("2026-06-11T09:00:00Z");
    const fri = new Date("2026-06-12T09:00:00Z");
    const mon = new Date("2026-06-15T09:00:00Z"); // next weekday after Fri
    const n = SPONSOR_MODULES.length;
    const idx = (d: Date) => SPONSOR_MODULES.indexOf(pickSponsorModule(d));
    expect((idx(fri) - idx(thu) + n) % n).toBe(1); // Thu → Fri
    expect((idx(mon) - idx(fri) + n) % n).toBe(1); // Fri → Mon, no weekend skip
  });
});

describe("sponsorHref", () => {
  it("bakes in per-module UTMs so injectUtms leaves it alone", () => {
    const m = SPONSOR_MODULES[0];
    const href = sponsorHref(m, "micro-adjust-2026-06-11");
    expect(href).toContain("utm_source=newsletter");
    expect(href).toContain("utm_medium=email");
    expect(href).toContain("utm_campaign=micro-adjust-2026-06-11");
    expect(href).toContain(`utm_content=module-${m.id}`);
  });

  it("preserves the OEM path for B2B modules", () => {
    const spec = SPONSOR_MODULES.find((m) => m.id === "spec")!;
    expect(sponsorHref(spec, "x")).toContain("/pages/oe-services");
  });
});
