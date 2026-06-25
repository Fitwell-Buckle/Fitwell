import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, recordPrototypeQuote } = vi.hoisted(() => ({
  auth: vi.fn(),
  recordPrototypeQuote: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prototypes/service", () => ({ recordPrototypeQuote }));

import { PATCH } from "./route";

const params = Promise.resolve({ id: "proto1", supplierId: "s1" });

function req(body: unknown) {
  return new Request(
    "https://portal.fitwellbuckle.co/api/prototypes/proto1/suppliers/s1",
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  recordPrototypeQuote.mockResolvedValue({ id: "row1" });
});

describe("PATCH /api/prototypes/[id]/suppliers/[supplierId]", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await PATCH(req({ unitCostCents: 100 }), { params });
    expect(res.status).toBe(403);
    expect(recordPrototypeQuote).not.toHaveBeenCalled();
  });

  it("400s a negative price", async () => {
    const res = await PATCH(req({ unitCostCents: -5 }), { params });
    expect(res.status).toBe(400);
  });

  it("records the quote", async () => {
    const res = await PATCH(
      req({ unitCostCents: 1299, leadTimeDays: 30, moq: 500 }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(recordPrototypeQuote).toHaveBeenCalledWith("proto1", "s1", {
      unitCostCents: 1299,
      leadTimeDays: 30,
      moq: 500,
    });
  });

  it("404s when the vendor isn't a candidate", async () => {
    recordPrototypeQuote.mockResolvedValue(null);
    const res = await PATCH(req({ unitCostCents: 100 }), { params });
    expect(res.status).toBe(404);
  });
});
