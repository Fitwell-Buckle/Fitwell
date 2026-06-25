import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, addPrototypeSupplier, removePrototypeSupplier } = vi.hoisted(
  () => ({
    auth: vi.fn(),
    addPrototypeSupplier: vi.fn(),
    removePrototypeSupplier: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prototypes/service", () => ({
  addPrototypeSupplier,
  removePrototypeSupplier,
}));

import { POST, DELETE } from "./route";

const params = Promise.resolve({ id: "proto1" });

function req(body?: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/prototypes/proto1/suppliers", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  addPrototypeSupplier.mockResolvedValue(undefined);
  removePrototypeSupplier.mockResolvedValue(undefined);
});

describe("POST /api/prototypes/[id]/suppliers", () => {
  it("401s when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req({ supplierId: "s1" }), { params });
    expect(res.status).toBe(401);
    expect(addPrototypeSupplier).not.toHaveBeenCalled();
  });

  it("403s suppliers and companies", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await POST(req({ supplierId: "s1" }), { params });
    expect(res.status).toBe(403);
    expect(addPrototypeSupplier).not.toHaveBeenCalled();
  });

  it("400s a missing supplierId", async () => {
    const res = await POST(req({}), { params });
    expect(res.status).toBe(400);
    expect(addPrototypeSupplier).not.toHaveBeenCalled();
  });

  it("adds the candidate vendor", async () => {
    const res = await POST(req({ supplierId: "s1" }), { params });
    expect(res.status).toBe(201);
    expect(addPrototypeSupplier).toHaveBeenCalledWith("proto1", "s1");
  });
});

describe("DELETE /api/prototypes/[id]/suppliers", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "company" } });
    const res = await DELETE(req({ supplierId: "s1" }), { params });
    expect(res.status).toBe(403);
    expect(removePrototypeSupplier).not.toHaveBeenCalled();
  });

  it("removes the candidate vendor", async () => {
    const res = await DELETE(req({ supplierId: "s1" }), { params });
    expect(res.status).toBe(200);
    expect(removePrototypeSupplier).toHaveBeenCalledWith("proto1", "s1");
  });
});
