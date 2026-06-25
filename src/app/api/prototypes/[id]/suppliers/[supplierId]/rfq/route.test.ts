import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, getPrototypeDetail, markRfqSent, sendEmail } = vi.hoisted(() => ({
  auth: vi.fn(),
  getPrototypeDetail: vi.fn(),
  markRfqSent: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prototypes/service", () => ({ getPrototypeDetail, markRfqSent }));
vi.mock("@/lib/email/resend", () => ({ sendEmail }));
// Contacts lookup for CC — return one extra contact.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => Promise.resolve([{ email: "team@vendor.com" }]) }),
    }),
  },
}));

import { POST } from "./route";

const params = Promise.resolve({ id: "proto1", supplierId: "s1" });

function req(body: unknown) {
  return new Request(
    "https://portal.fitwellbuckle.co/api/prototypes/proto1/suppliers/s1/rfq",
    { method: "POST", body: JSON.stringify(body) },
  );
}

const proto = {
  name: "Titanium v2",
  proposedSku: "FW-TI-002",
  description: "spec",
  references: [{ url: "https://a360.co/x", title: "Body" }],
  candidateVendors: [{ supplierId: "s1", supplier: { name: "Acme" } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    user: { id: "u1", role: "admin", email: "me@fitwellbuckle.co" },
  });
  getPrototypeDetail.mockResolvedValue(proto);
  markRfqSent.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue({ id: "email1" });
});

describe("POST /api/prototypes/[id]/suppliers/[supplierId]/rfq", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "company" } });
    const res = await POST(req({ to: "v@vendor.com" }), { params });
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("400s a missing/invalid recipient", async () => {
    const res = await POST(req({ to: "not-an-email" }), { params });
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("404s when the vendor isn't a candidate", async () => {
    getPrototypeDetail.mockResolvedValue({ ...proto, candidateVendors: [] });
    const res = await POST(req({ to: "v@vendor.com" }), { params });
    expect(res.status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends the RFQ, stamps rfq_sent_at, and CCs the sender + contacts", async () => {
    const res = await POST(
      req({ to: "v@vendor.com", message: "hi" }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe("v@vendor.com");
    expect(arg.subject).toContain("Request for Quote");
    expect(arg.replyTo).toBe("me@fitwellbuckle.co");
    expect(arg.cc).toEqual(
      expect.arrayContaining(["me@fitwellbuckle.co", "team@vendor.com"]),
    );
    expect(markRfqSent).toHaveBeenCalledWith("proto1", "s1");
  });
});
