import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, promoteIdeaToPrototype } = vi.hoisted(() => ({
  auth: vi.fn(),
  promoteIdeaToPrototype: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/product-ideas/service", () => ({ promoteIdeaToPrototype }));

import { POST } from "./route";

const params = Promise.resolve({ id: "idea1" });
const req = () =>
  new Request("https://portal.fitwellbuckle.co/api/product-ideas/idea1/promote", {
    method: "POST",
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  promoteIdeaToPrototype.mockResolvedValue({
    prototypeId: "proto9",
    alreadyPromoted: false,
  });
});

describe("POST /api/product-ideas/[id]/promote", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await POST(req(), { params });
    expect(res.status).toBe(403);
    expect(promoteIdeaToPrototype).not.toHaveBeenCalled();
  });

  it("promotes and returns the new prototype id", async () => {
    const res = await POST(req(), { params });
    expect(res.status).toBe(200);
    expect(promoteIdeaToPrototype).toHaveBeenCalledWith("idea1");
    expect((await res.json()).data.prototypeId).toBe("proto9");
  });

  it("404s an unknown idea", async () => {
    promoteIdeaToPrototype.mockResolvedValue(null);
    const res = await POST(req(), { params });
    expect(res.status).toBe(404);
  });
});
