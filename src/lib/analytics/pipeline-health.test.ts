import { describe, it, expect } from "vitest";
import {
  evaluatePipelineFreshness,
  stalePipelines,
  type PipelineSpec,
} from "./pipeline-health";

const NOW = new Date("2026-06-29T17:00:00Z");

const SPECS: PipelineSpec[] = [
  { key: "ga4_daily", label: "GA4 traffic", maxAgeHours: 72, expectLive: true },
  { key: "gsc_daily", label: "Search Console", maxAgeHours: 144, expectLive: false },
];

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

describe("evaluatePipelineFreshness", () => {
  it("marks a recent row fresh", () => {
    const [ga4] = evaluatePipelineFreshness({ ga4_daily: hoursAgo(40), gsc_daily: null }, NOW, SPECS);
    expect(ga4.fresh).toBe(true);
    expect(ga4.ageHours).toBe(40);
  });

  it("marks a row past its threshold stale", () => {
    const [ga4] = evaluatePipelineFreshness({ ga4_daily: hoursAgo(100), gsc_daily: null }, NOW, SPECS);
    expect(ga4.fresh).toBe(false);
    expect(ga4.ageHours).toBe(100);
  });

  it("treats the threshold as inclusive (exactly maxAgeHours is still fresh)", () => {
    const [ga4] = evaluatePipelineFreshness({ ga4_daily: hoursAgo(72), gsc_daily: null }, NOW, SPECS);
    expect(ga4.fresh).toBe(true);
  });

  it("treats an empty table (null date) as not fresh", () => {
    const [, gsc] = evaluatePipelineFreshness({ ga4_daily: hoursAgo(10), gsc_daily: null }, NOW, SPECS);
    expect(gsc.lastDate).toBeNull();
    expect(gsc.ageHours).toBeNull();
    expect(gsc.fresh).toBe(false);
  });

  it("uses each pipeline's own threshold (GSC's wider lag window)", () => {
    // 120h old: stale for GA4's 72h, but fresh for GSC's 144h window.
    const fresh = evaluatePipelineFreshness(
      { ga4_daily: hoursAgo(120), gsc_daily: hoursAgo(120) },
      NOW,
      SPECS,
    );
    expect(fresh.find((f) => f.key === "ga4_daily")?.fresh).toBe(false);
    expect(fresh.find((f) => f.key === "gsc_daily")?.fresh).toBe(true);
  });
});

describe("stalePipelines", () => {
  it("includes an expectLive pipeline that is stale", () => {
    const f = evaluatePipelineFreshness({ ga4_daily: hoursAgo(100), gsc_daily: hoursAgo(10) }, NOW, SPECS);
    expect(stalePipelines(f).map((p) => p.key)).toEqual(["ga4_daily"]);
  });

  it("excludes a not-yet-configured pipeline even when empty/stale", () => {
    // GSC empty (null) — not fresh — but expectLive=false, so it must NOT alert.
    const f = evaluatePipelineFreshness({ ga4_daily: hoursAgo(10), gsc_daily: null }, NOW, SPECS);
    expect(stalePipelines(f)).toEqual([]);
  });

  it("returns empty when everything live is fresh", () => {
    const f = evaluatePipelineFreshness({ ga4_daily: hoursAgo(10), gsc_daily: null }, NOW, SPECS);
    expect(stalePipelines(f)).toEqual([]);
  });
});
