import { describe, expect, it } from "vitest";
import {
  applyCreatorListParams,
  filterCreators,
  sortCreators,
  type CreatorListRow,
} from "./list";

function row(partial: Partial<CreatorListRow> & { id: string }): CreatorListRow {
  return {
    name: partial.id,
    status: "prospect",
    vettingStatus: "unreviewed",
    scoreBoost: 0,
    country: null,
    outOfMarket: false,
    stage: "prospect",
    primaryPlatform: "ig",
    crossPlatformFit: 50,
    platforms: [{ platform: "ig", handle: partial.id, fitScore: 50, watchConfidence: "medium" }],
    followersTotal: 10_000,
    bestErPct: 2,
    lastPostDate: "2026-06-01",
    hasEmail: true,
    ...partial,
  };
}

const ROWS: CreatorListRow[] = [
  row({ id: "a", crossPlatformFit: 90, followersTotal: 5_000 }),
  row({
    id: "b",
    crossPlatformFit: 70,
    followersTotal: 80_000,
    platforms: [
      { platform: "ig", handle: "b", fitScore: 60, watchConfidence: "high" },
      { platform: "yt", handle: "b", fitScore: 70, watchConfidence: "high" },
    ],
  }),
  row({ id: "c", crossPlatformFit: 40, status: "burned" }),
  row({
    id: "d",
    crossPlatformFit: 60,
    status: "active",
    platforms: [{ platform: "yt", handle: "watchd", fitScore: 60, watchConfidence: "low" }],
  }),
];

describe("filterCreators", () => {
  it("hides burned/archived by default", () => {
    expect(filterCreators(ROWS, {}).map((r) => r.id)).toEqual(["a", "b", "d"]);
  });

  it("all=1 shows everything", () => {
    expect(filterCreators(ROWS, { all: "1" })).toHaveLength(4);
  });

  it("explicit status filter includes burned", () => {
    expect(filterCreators(ROWS, { status: "burned" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("platform=multi keeps only multi-platform creators", () => {
    expect(filterCreators(ROWS, { platform: "multi" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("platform=yt matches any yt record", () => {
    expect(filterCreators(ROWS, { platform: "yt" }).map((r) => r.id)).toEqual(["b", "d"]);
  });

  it("q matches name or handle", () => {
    expect(filterCreators(ROWS, { q: "watchd" }).map((r) => r.id)).toEqual(["d"]);
  });
});

describe("sortCreators", () => {
  it("defaults to fit desc", () => {
    expect(sortCreators(ROWS, {}).map((r) => r.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("sorts by followers", () => {
    expect(
      sortCreators(ROWS, { sort: "followers" }).map((r) => r.id)[0],
    ).toBe("b");
  });

  it("name sort defaults ascending", () => {
    expect(sortCreators(ROWS, { sort: "name" }).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("dir overrides", () => {
    expect(
      sortCreators(ROWS, { sort: "fit", dir: "asc" }).map((r) => r.id),
    ).toEqual(["c", "d", "b", "a"]);
  });
});

describe("applyCreatorListParams", () => {
  it("filters then sorts", () => {
    expect(
      applyCreatorListParams(ROWS, { platform: "yt", sort: "fit" }).map((r) => r.id),
    ).toEqual(["b", "d"]);
  });
});

describe("vetting", () => {
  const VET_ROWS = [
    row({ id: "u", vettingStatus: "unreviewed", crossPlatformFit: 50 }),
    row({ id: "ok", vettingStatus: "approved", crossPlatformFit: 50 }),
    row({ id: "no", vettingStatus: "rejected", crossPlatformFit: 99 }),
    row({ id: "boosted", crossPlatformFit: 40, scoreBoost: 30 }),
  ];

  it("hides rejected by default", () => {
    expect(filterCreators(VET_ROWS, {}).map((r) => r.id)).toEqual([
      "u",
      "ok",
      "boosted",
    ]);
  });

  it("vetting=rejected shows only rejected", () => {
    expect(filterCreators(VET_ROWS, { vetting: "rejected" }).map((r) => r.id)).toEqual(
      ["no"],
    );
  });

  it("vetting=unreviewed gives the to-vet queue", () => {
    expect(
      filterCreators(VET_ROWS, { vetting: "unreviewed" }).map((r) => r.id),
    ).toEqual(["u", "boosted"]);
  });

  it("rejected stay hidden even under lifecycle-status filters", () => {
    const rows = [
      row({ id: "keep", status: "prospect", vettingStatus: "approved" }),
      row({ id: "dumped", status: "prospect", vettingStatus: "rejected" }),
    ];
    expect(filterCreators(rows, { status: "prospect" }).map((r) => r.id)).toEqual([
      "keep",
    ]);
    // …but Everything still shows them
    expect(filterCreators(rows, { all: "1" })).toHaveLength(2);
  });

  it("stage filter narrows to one pipeline stage", () => {
    const rows = [
      row({ id: "p", stage: "prospect" }),
      row({ id: "e", stage: "evaluating" }),
    ];
    expect(filterCreators(rows, { stage: "evaluating" }).map((r) => r.id)).toEqual([
      "e",
    ]);
  });

  it("out-of-market creators are parked: hidden by default, own pill, back via Everything", () => {
    const rows = [
      row({ id: "us", country: "US" }),
      row({ id: "in", country: "IN", outOfMarket: true }),
    ];
    expect(filterCreators(rows, {}).map((r) => r.id)).toEqual(["us"]);
    expect(filterCreators(rows, { market: "out" }).map((r) => r.id)).toEqual(["in"]);
    expect(filterCreators(rows, { all: "1" })).toHaveLength(2);
  });

  it("score boost moves a creator up the fit sort", () => {
    expect(sortCreators(VET_ROWS, { sort: "fit" }).map((r) => r.id)[0]).toBe(
      "no", // 99 — but hidden by filter in practice
    );
    const visible = applyCreatorListParams(VET_ROWS, {});
    expect(visible[0].id).toBe("boosted"); // 40 + 30 = 70 beats the 50s
  });
});
