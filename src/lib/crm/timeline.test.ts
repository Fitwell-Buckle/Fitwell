import { describe, expect, it } from "vitest";
import { buildLeadTimeline } from "./timeline";

const d = (iso: string) => new Date(iso);

describe("buildLeadTimeline", () => {
  it("returns an empty list when there's nothing", () => {
    expect(buildLeadTimeline([], [])).toEqual([]);
  });

  it("interleaves comments and messages newest-first by createdAt", () => {
    const comments = [
      { id: "c1", createdAt: d("2026-01-03"), body: "Called them", author: "Tom" },
      { id: "c2", createdAt: d("2026-01-01"), body: "Met at booth", author: "Oliver" },
    ];
    const messages = [
      {
        id: "m1",
        createdAt: d("2026-01-02"),
        sequenceStep: 1,
        subject: "Nice to meet you",
        status: "sent",
        sentAt: d("2026-01-02"),
        openCount: 0,
        lastOpenedAt: null,
      },
    ];
    const order = buildLeadTimeline(comments, messages).map((i) => i.id);
    expect(order).toEqual(["c1", "m1", "c2"]);
  });

  it("tags each item with its kind", () => {
    const out = buildLeadTimeline(
      [{ id: "c1", createdAt: d("2026-01-02"), body: "hi" }],
      [
        {
          id: "m1",
          createdAt: d("2026-01-01"),
          sequenceStep: 2,
          subject: null,
          status: "sent",
          sentAt: d("2026-01-01"),
          openCount: 4,
          lastOpenedAt: d("2026-01-02"),
        },
      ],
    );
    expect(out[0]).toMatchObject({ kind: "comment", id: "c1", author: null });
    expect(out[1]).toMatchObject({
      kind: "message",
      id: "m1",
      sequenceStep: 2,
      openCount: 4,
      lastOpenedAt: d("2026-01-02"),
    });
  });

  it("orders a comment before a message when timestamps tie", () => {
    const t = d("2026-01-05T10:00:00Z");
    const out = buildLeadTimeline(
      [{ id: "c1", createdAt: t, body: "x" }],
      [
        {
          id: "m1",
          createdAt: t,
          sequenceStep: 1,
          subject: "s",
          status: "sent",
          sentAt: t,
          openCount: 0,
          lastOpenedAt: null,
        },
      ],
    );
    expect(out.map((i) => i.id)).toEqual(["c1", "m1"]);
  });
});
