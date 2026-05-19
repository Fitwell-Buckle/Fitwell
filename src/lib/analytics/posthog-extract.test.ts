import { describe, it, expect, vi, beforeEach } from "vitest";

const { del, insert, values, where } = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn(() => ({ where }));
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return { del, insert, values, where };
});

vi.mock("@/lib/db", () => ({ db: { delete: del, insert } }));
vi.mock("@/lib/schema", () => ({ posthogDaily: { date: "date" } }));

import { extractPostHogDaily } from "./posthog-extract";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.POSTHOG_PROJECT_ID = "430335";
  process.env.POSTHOG_PERSONAL_API_KEY = "phx_secret";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
});

describe("extractPostHogDaily", () => {
  it("throws without project id / personal key", async () => {
    delete process.env.POSTHOG_PROJECT_ID;
    await expect(extractPostHogDaily(new Date("2026-05-17"))).rejects.toThrow(
      /POSTHOG_PROJECT_ID/,
    );
  });

  it("queries the project, clears the day, inserts rollups", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          ["2026-05-17", "$pageview", 120, 80],
          ["2026-05-17", "purchase_completed", 3, 3],
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const n = await extractPostHogDaily(new Date("2026-05-17T12:00:00Z"));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.i.posthog.com/api/projects/430335/query/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(del).toHaveBeenCalledOnce(); // idempotent clear
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ eventName: "$pageview", count: 120, uniqueUsers: 80 }),
      expect.objectContaining({ eventName: "purchase_completed", count: 3 }),
    ]);
    expect(n).toBe(2);
  });

  it("clears the day but inserts nothing when there are no events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }),
    );
    const n = await extractPostHogDaily(new Date("2026-05-17"));
    expect(del).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it("throws on a non-OK query API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "forbidden",
      }),
    );
    await expect(extractPostHogDaily(new Date("2026-05-17"))).rejects.toThrow(
      /403/,
    );
  });
});
