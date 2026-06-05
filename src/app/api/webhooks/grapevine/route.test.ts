import { describe, it, expect, vi, beforeEach } from "vitest";

const { ingestGrapevineResponse } = vi.hoisted(() => ({
  ingestGrapevineResponse: vi.fn(),
}));

// Stub the db module so importing ingest.ts → schema → db doesn't try to
// connect to Neon in the unit test process.
vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/grapevine/ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grapevine/ingest")>();
  return { ...actual, ingestGrapevineResponse };
});

import { POST } from "./route";

const SECRET = "test-secret-value";
const ENDPOINT = "https://admin.fitwellbuckle.co/api/webhooks/grapevine";

function makeReq(opts: {
  body?: unknown;
  secret?: string | null;
  rawBody?: string;
}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.secret !== null && opts.secret !== undefined) {
    headers["x-grapevine-secret"] = opts.secret;
  }
  return new Request(ENDPOINT, {
    method: "POST",
    headers,
    body: opts.rawBody ?? JSON.stringify(opts.body),
  });
}

const validPayload = {
  providerResponseId: "gv-resp-abc123",
  surveyCode: "698cc69eca3e5",
  surveyName: "Post purchase survey",
  surface: "checkout_app_block",
  questionKey: "where_first_heard",
  answer: "Social Media: Instagram",
  customerEmail: "tom@example.com",
  shopifyOrderId: "gid://shopify/Order/123",
  orderName: "#1234",
  respondedAt: "2026-06-05T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GRAPEVINE_WEBHOOK_SECRET = SECRET;
  ingestGrapevineResponse.mockResolvedValue({
    status: "stored",
    id: "row-1",
    orderResolved: true,
  });
});

describe("POST /api/webhooks/grapevine — auth", () => {
  it("rejects when the secret header is missing", async () => {
    const res = await POST(makeReq({ body: validPayload, secret: null }));
    expect(res.status).toBe(401);
    expect(ingestGrapevineResponse).not.toHaveBeenCalled();
  });

  it("rejects when the secret header is wrong", async () => {
    const res = await POST(makeReq({ body: validPayload, secret: "wrong" }));
    expect(res.status).toBe(401);
    expect(ingestGrapevineResponse).not.toHaveBeenCalled();
  });

  it("rejects all traffic when GRAPEVINE_WEBHOOK_SECRET is unset (inert until configured)", async () => {
    delete process.env.GRAPEVINE_WEBHOOK_SECRET;
    const res = await POST(makeReq({ body: validPayload, secret: SECRET }));
    expect(res.status).toBe(401);
    expect(ingestGrapevineResponse).not.toHaveBeenCalled();
  });

  it("rejects with constant-time compare semantics — different-length secrets fail cleanly", async () => {
    const res = await POST(
      makeReq({ body: validPayload, secret: SECRET + "extra" }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/webhooks/grapevine — payload validation", () => {
  it("rejects invalid JSON with 400", async () => {
    const res = await POST(makeReq({ rawBody: "not json", secret: SECRET }));
    expect(res.status).toBe(400);
    expect(ingestGrapevineResponse).not.toHaveBeenCalled();
  });

  it("rejects payloads missing providerResponseId", async () => {
    const { providerResponseId: _, ...rest } = validPayload;
    void _;
    const res = await POST(makeReq({ body: rest, secret: SECRET }));
    expect(res.status).toBe(400);
    expect(ingestGrapevineResponse).not.toHaveBeenCalled();
  });

  it("rejects non-ISO respondedAt", async () => {
    const res = await POST(
      makeReq({
        body: { ...validPayload, respondedAt: "2026/06/05 12:00" },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/grapevine — happy path", () => {
  it("calls ingest with the parsed payload and returns the ingest result", async () => {
    const res = await POST(makeReq({ body: validPayload, secret: SECRET }));
    expect(res.status).toBe(200);
    expect(ingestGrapevineResponse).toHaveBeenCalledOnce();
    expect(ingestGrapevineResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        providerResponseId: "gv-resp-abc123",
        answer: "Social Media: Instagram",
      }),
    );
    await expect(res.json()).resolves.toEqual({
      status: "stored",
      id: "row-1",
      orderResolved: true,
    });
  });

  it("defaults questionKey to 'where_first_heard' when omitted (current single-question survey)", async () => {
    const { questionKey: _, ...rest } = validPayload;
    void _;
    const res = await POST(makeReq({ body: rest, secret: SECRET }));
    expect(res.status).toBe(200);
    expect(ingestGrapevineResponse).toHaveBeenCalledWith(
      expect.objectContaining({ questionKey: "where_first_heard" }),
    );
  });

  it("returns 500 (so Shopify Flow retries) when ingest throws", async () => {
    ingestGrapevineResponse.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(makeReq({ body: validPayload, secret: SECRET }));
    expect(res.status).toBe(500);
  });
});
