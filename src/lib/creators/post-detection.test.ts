import { describe, expect, it } from "vitest";
import {
  dedupPosts,
  detectPosts,
  matchGiftOrder,
  type FetchedPost,
  type GiftOrderCandidate,
} from "./post-detection";

function post(partial: Partial<FetchedPost>): FetchedPost {
  return {
    postUrl: "https://youtube.com/watch?v=x",
    postedAt: new Date("2026-06-10"),
    caption: null,
    likes: null,
    comments: null,
    views: null,
    ...partial,
  };
}

const ORDERS: GiftOrderCandidate[] = [
  { id: "old", sentAt: new Date("2026-03-01") },
  { id: "recent", sentAt: new Date("2026-05-25") },
  { id: "newer", sentAt: new Date("2026-06-05") },
  { id: "unsent", sentAt: null },
];

describe("matchGiftOrder", () => {
  it("picks the most recent order within the 30-day window", () => {
    expect(matchGiftOrder(post({ postedAt: new Date("2026-06-10") }), ORDERS)).toBe(
      "newer",
    );
  });

  it("ignores orders sent AFTER the post", () => {
    expect(matchGiftOrder(post({ postedAt: new Date("2026-06-01") }), ORDERS)).toBe(
      "recent",
    );
  });

  it("returns null outside the window", () => {
    expect(
      matchGiftOrder(post({ postedAt: new Date("2026-04-20") }), ORDERS),
    ).toBeNull();
  });

  it("undated posts anchor to now", () => {
    expect(
      matchGiftOrder(post({ postedAt: null }), ORDERS, new Date("2026-06-12")),
    ).toBe("newer");
  });
});

describe("dedupPosts", () => {
  it("drops already-stored and repeated URLs", () => {
    const fetched = [
      post({ postUrl: "https://a" }),
      post({ postUrl: "https://a" }),
      post({ postUrl: "https://b" }),
      post({ postUrl: "" }),
    ];
    expect(dedupPosts(fetched, ["https://b"]).map((p) => p.postUrl)).toEqual([
      "https://a",
    ]);
  });
});

describe("detectPosts", () => {
  it("flags mentions and links gift orders", () => {
    const detected = detectPosts(
      [
        post({
          postUrl: "https://yt/1",
          caption: "Unboxing the @fitwellbuckle micro-adjust",
          postedAt: new Date("2026-06-10"),
        }),
        post({
          postUrl: "https://yt/2",
          caption: "My EDC rotation",
          postedAt: new Date("2026-06-10"),
        }),
      ],
      [],
      ORDERS,
    );
    expect(detected[0].mentionedUs).toBe(true);
    expect(detected[0].giftOrderId).toBe("newer");
    expect(detected[1].mentionedUs).toBe(false);
  });
});
