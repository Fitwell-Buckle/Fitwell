import { describe, it, expect, vi, beforeEach } from "vitest";

const captureMock = vi.fn();
const flushMock = vi.fn().mockResolvedValue(undefined);
const aliasMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = captureMock;
    flush = flushMock;
    alias = aliasMock;
    constructor(...args: unknown[]) {
      ctorMock(...args);
    }
  },
}));

import {
  getPostHogClient,
  captureEvent,
  identify,
  flushEvents,
  __resetPostHogForTests,
} from "./posthog";

beforeEach(() => {
  vi.clearAllMocks();
  __resetPostHogForTests();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

describe("getPostHogClient", () => {
  it("returns null and does not throw when key is missing", () => {
    expect(getPostHogClient()).toBeNull();
  });

  it("constructs once and reuses the singleton", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const a = getPostHogClient();
    const b = getPostHogClient();
    expect(a).toBe(b);
    expect(ctorMock).toHaveBeenCalledTimes(1);
  });

  it("defaults host to US cloud when unset", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    getPostHogClient();
    expect(ctorMock).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ host: "https://us.i.posthog.com" }),
    );
  });
});

describe("captureEvent / identify", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  });

  it("captures an event with properties", () => {
    captureEvent("d1", "purchase_completed", { order_value: 4000 });
    expect(captureMock).toHaveBeenCalledWith({
      distinctId: "d1",
      event: "purchase_completed",
      properties: { order_value: 4000 },
    });
  });

  it("identify splits set vs setOnce into $set / $set_once", () => {
    identify("d1", { last_order_at: "now" }, { utm_source: "google" });
    expect(captureMock).toHaveBeenCalledWith({
      distinctId: "d1",
      event: "$identify",
      properties: {
        $set: { last_order_at: "now" },
        $set_once: { utm_source: "google" },
      },
    });
  });

  it("is a no-op when unconfigured (no throw)", () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    expect(() => captureEvent("d1", "e")).not.toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("flushEvents", () => {
  it("no-ops when client never initialized", async () => {
    await expect(flushEvents()).resolves.toBeUndefined();
    expect(flushMock).not.toHaveBeenCalled();
  });

  it("flushes when configured", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    getPostHogClient();
    await flushEvents();
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});
