import { describe, expect, it } from "vitest";
import {
  nextFollowupAt,
  pipelineStage,
  type LifecycleFacts,
} from "./lifecycle";

function facts(partial: Partial<LifecycleFacts>): LifecycleFacts {
  return {
    status: "prospect",
    hasOutreach: false,
    sampleSentAt: null,
    sampleDeliveredAt: null,
    hasPost: false,
    ...partial,
  };
}

describe("pipelineStage", () => {
  it("walks the ladder: prospect → outreach → agreed → sample_sent → evaluating → posted", () => {
    expect(pipelineStage(facts({}))).toBe("prospect");
    expect(pipelineStage(facts({ hasOutreach: true }))).toBe("outreach");
    expect(pipelineStage(facts({ status: "contacted" }))).toBe("outreach");
    expect(pipelineStage(facts({ status: "agreed" }))).toBe("agreed");
    expect(
      pipelineStage(facts({ status: "agreed", sampleSentAt: new Date() })),
    ).toBe("sample_sent");
    expect(
      pipelineStage(
        facts({
          status: "agreed",
          sampleSentAt: new Date(),
          sampleDeliveredAt: new Date(),
        }),
      ),
    ).toBe("evaluating");
    expect(
      pipelineStage(
        facts({ status: "agreed", sampleDeliveredAt: new Date(), hasPost: true }),
      ),
    ).toBe("posted");
  });

  it("derived facts outrank a stale status (zero-drift)", () => {
    // Someone forgot to move them past "contacted" but the sample shipped.
    expect(
      pipelineStage(facts({ status: "contacted", sampleSentAt: new Date() })),
    ).toBe("sample_sent");
  });

  it("burned/archived have no pipeline stage", () => {
    expect(pipelineStage(facts({ status: "burned", hasPost: true }))).toBeNull();
    expect(pipelineStage(facts({ status: "archived" }))).toBeNull();
  });
});

describe("nextFollowupAt", () => {
  const from = new Date("2026-06-12T00:00:00Z");

  it("no_reply → +7d, replied/negotiating → +3d", () => {
    expect(nextFollowupAt("no_reply", from)?.toISOString().slice(0, 10)).toBe(
      "2026-06-19",
    );
    expect(nextFollowupAt("replied", from)?.toISOString().slice(0, 10)).toBe(
      "2026-06-15",
    );
    expect(nextFollowupAt("negotiating", from)?.toISOString().slice(0, 10)).toBe(
      "2026-06-15",
    );
  });

  it("terminal statuses get no follow-up", () => {
    expect(nextFollowupAt("agreed", from)).toBeNull();
    expect(nextFollowupAt("declined", from)).toBeNull();
    expect(nextFollowupAt("ghosted", from)).toBeNull();
  });
});
