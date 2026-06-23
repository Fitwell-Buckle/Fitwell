import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, getPrototypeRow, updatePrototype, deletePrototype } = vi.hoisted(
  () => ({
    auth: vi.fn(),
    getPrototypeRow: vi.fn(),
    updatePrototype: vi.fn(),
    deletePrototype: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prototypes/service", () => ({
  getPrototypeRow,
  updatePrototype,
  deletePrototype,
}));

import { PATCH, DELETE } from "./route";

function makeReq(body: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/prototypes/p1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "p1" });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  updatePrototype.mockResolvedValue({ id: "p1" });
  deletePrototype.mockResolvedValue({ id: "p1" });
  getPrototypeRow.mockResolvedValue({ id: "p1", status: "in_development", finalSku: null });
});

describe("PATCH /api/prototypes/[id]", () => {
  it("401s when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await PATCH(makeReq({ name: "x" }), { params });
    expect(res.status).toBe(401);
  });

  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await PATCH(makeReq({ name: "x" }), { params });
    expect(res.status).toBe(403);
  });

  it("400s an empty update", async () => {
    const res = await PATCH(makeReq({}), { params });
    expect(res.status).toBe(400);
  });

  it("400s an invalid status enum", async () => {
    const res = await PATCH(makeReq({ status: "bogus" }), { params });
    expect(res.status).toBe(400);
    expect(updatePrototype).not.toHaveBeenCalled();
  });

  it("blocks approval with no final SKU (none on row, none in payload)", async () => {
    const res = await PATCH(makeReq({ status: "approved" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/final SKU/i);
    expect(updatePrototype).not.toHaveBeenCalled();
  });

  it("approves with a final SKU in the payload and stamps the fields", async () => {
    const res = await PATCH(
      makeReq({ status: "approved", finalSku: "FW-TI-002" }),
      { params },
    );
    expect(res.status).toBe(200);
    const extra = updatePrototype.mock.calls[0][2];
    expect(extra.finalSku).toBe("FW-TI-002");
    expect(extra.approvedAt).toBeInstanceOf(Date);
  });

  it("approves using a final SKU already on the row", async () => {
    getPrototypeRow.mockResolvedValue({ id: "p1", status: "in_development", finalSku: "FW-EXIST" });
    const res = await PATCH(makeReq({ status: "approved" }), { params });
    expect(res.status).toBe(200);
    expect(updatePrototype.mock.calls[0][2].finalSku).toBe("FW-EXIST");
  });

  it("404s when the prototype is missing on a normal update", async () => {
    updatePrototype.mockResolvedValue(null);
    const res = await PATCH(makeReq({ name: "x" }), { params });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/prototypes/[id]", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await DELETE(makeReq({}), { params });
    expect(res.status).toBe(403);
  });

  it("deletes and returns the id", async () => {
    const res = await DELETE(makeReq({}), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("p1");
  });

  it("404s a missing prototype", async () => {
    deletePrototype.mockResolvedValue(null);
    const res = await DELETE(makeReq({}), { params });
    expect(res.status).toBe(404);
  });
});
