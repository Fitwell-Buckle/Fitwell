import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

const whereSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { delete: vi.fn(() => ({ where: whereSpy })) },
}));

import webpush from "web-push";
import { sendToSubscriptions, isPushConfigured } from "@/lib/push/send";
import { db } from "@/lib/db";

const mockSend = vi.mocked(webpush.sendNotification);

function sub(id: string, endpoint: string) {
  return {
    id,
    endpoint,
    p256dh: "key",
    auth: "auth",
    userId: "u1",
    userAgent: null,
    createdAt: new Date(),
    lastUsedAt: null,
  };
}

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("isPushConfigured", () => {
  it("is false when VAPID keys are unset", () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(isPushConfigured()).toBe(false);
  });

  it("is true when both keys are set", () => {
    expect(isPushConfigured()).toBe(true);
  });
});

describe("sendToSubscriptions", () => {
  it("no-ops when push is not configured", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const res = await sendToSubscriptions([sub("a", "https://e/a")], { title: "x" });
    expect(res).toEqual({ configured: false, sent: 0, pruned: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("counts successful sends and prunes dead (410) subscriptions", async () => {
    mockSend.mockImplementation((s: { endpoint: string }) => {
      if (s.endpoint.endsWith("/dead")) {
        return Promise.reject({ statusCode: 410 });
      }
      return Promise.resolve({} as never);
    });

    const res = await sendToSubscriptions(
      [sub("good", "https://push/good"), sub("dead", "https://push/dead")],
      { title: "Hi", body: "there", url: "/notifications" },
    );

    expect(res.configured).toBe(true);
    expect(res.sent).toBe(1);
    expect(res.pruned).toBe(1);
    // The dead subscription was deleted from the DB.
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("does not prune on transient (500) errors", async () => {
    mockSend.mockRejectedValue({ statusCode: 500 });
    const res = await sendToSubscriptions([sub("a", "https://push/a")], { title: "x" });
    expect(res.sent).toBe(0);
    expect(res.pruned).toBe(0);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("serializes the payload as the push body", async () => {
    mockSend.mockResolvedValue({} as never);
    await sendToSubscriptions([sub("a", "https://push/a")], {
      title: "T",
      body: "B",
      url: "/x",
    });
    const [, body] = mockSend.mock.calls[0];
    expect(JSON.parse(body as string)).toEqual({ title: "T", body: "B", url: "/x" });
  });
});
