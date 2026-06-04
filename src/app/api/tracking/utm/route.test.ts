import { describe, it, expect, vi, beforeEach } from "vitest";

const { onConflictDoNothing, values, insert } = vi.hoisted(() => {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { onConflictDoNothing, values, insert };
});

vi.mock("@/lib/db", () => ({ db: { insert } }));
vi.mock("@/lib/schema", () => ({ utmAttribution: { sessionId: "session_id" } }));

// Legacy field-name shim test (verifies backward compat for snippet deploy lag)
const legacyValid = {
  fwDistinctId: "ph_legacy",
  sessionId: "sess_legacy",
  source: "google",
};

import { POST, OPTIONS } from "./route";
import { NextRequest } from "next/server";

function makeReq(body: unknown, origin = "https://www.fitwellbuckle.co") {
  return new NextRequest("https://admin.fitwellbuckle.co/api/tracking/utm", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

const valid = {
  posthogDistinctId: "ph_abc123",
  sessionId: "sess_1",
  source: "google",
  medium: "cpc",
  campaign: "spring",
  gclid: "Cj0xyz",
  landingPage: "https://www.fitwellbuckle.co/?utm_source=google",
};

beforeEach(() => vi.clearAllMocks());

describe("OPTIONS /api/tracking/utm", () => {
  it("returns 204 with CORS for an allowed origin", () => {
    const res = OPTIONS(makeReq(valid));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://www.fitwellbuckle.co",
    );
  });
});

describe("POST /api/tracking/utm", () => {
  it("inserts a first-touch row idempotently and returns 200", async () => {
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        posthogDistinctId: "ph_abc123",
        sessionId: "sess_1",
        source: "google",
        gclid: "Cj0xyz",
      }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: "session_id" });
  });

  it("rejects a payload missing required ids with 400", async () => {
    const res = await POST(makeReq({ source: "google" }));
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("falls back to the canonical origin for a disallowed origin", async () => {
    const res = await POST(makeReq(valid, "https://evil.example"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://www.fitwellbuckle.co",
    );
  });

  it("accepts the legacy fwDistinctId field and writes as posthogDistinctId", async () => {
    const res = await POST(makeReq(legacyValid));
    expect(res.status).toBe(200);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ posthogDistinctId: "ph_legacy" }),
    );
  });

  it("returns 500 (with CORS) when the insert throws", async () => {
    onConflictDoNothing.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://www.fitwellbuckle.co",
    );
  });
});
