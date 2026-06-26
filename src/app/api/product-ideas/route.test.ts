import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, createIdea } = vi.hoisted(() => ({
  auth: vi.fn(),
  createIdea: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/product-ideas/service", () => ({ createIdea }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/product-ideas", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  createIdea.mockResolvedValue({ id: "idea1" });
});

describe("POST /api/product-ideas", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "company" } });
    const res = await POST(req({ name: "X" }));
    expect(res.status).toBe(403);
  });

  it("400s a missing name", async () => {
    const res = await POST(req({ description: "no name" }));
    expect(res.status).toBe(400);
    expect(createIdea).not.toHaveBeenCalled();
  });

  it("400s an out-of-range ICE score", async () => {
    const res = await POST(req({ name: "X", impact: 11 }));
    expect(res.status).toBe(400);
  });

  it("creates an idea", async () => {
    const res = await POST(req({ name: "Quick-release clasp", impact: 8 }));
    expect(res.status).toBe(201);
    expect(createIdea).toHaveBeenCalled();
    expect((await res.json()).data.id).toBe("idea1");
  });
});
