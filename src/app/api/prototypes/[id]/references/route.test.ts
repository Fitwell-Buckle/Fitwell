import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, addReference, resolveFusionEmbed } = vi.hoisted(() => ({
  auth: vi.fn(),
  addReference: vi.fn(),
  resolveFusionEmbed: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prototypes/service", () => ({ addReference }));
// Keep the real host-allowlist logic; only stub the network resolver.
vi.mock("@/lib/prototypes/fusion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/prototypes/fusion")>()),
  resolveFusionEmbed,
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/prototypes/p1/references", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "p1" });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  addReference.mockResolvedValue({ id: "ref1" });
  resolveFusionEmbed.mockResolvedValue({
    canonicalUrl: "https://h.autodesk360.com/g/shares/SH1",
    embedUrl: "https://h.autodesk360.com/g/shares/SH1?mode=embed",
  });
});

describe("POST /api/prototypes/[id]/references", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await POST(makeReq({ url: "https://a360.co/x" }), { params });
    expect(res.status).toBe(403);
  });

  it("400s a non-Autodesk link before any network call", async () => {
    const res = await POST(makeReq({ url: "https://evil.test/x" }), { params });
    expect(res.status).toBe(400);
    expect(resolveFusionEmbed).not.toHaveBeenCalled();
    expect(addReference).not.toHaveBeenCalled();
  });

  it("resolves the embed URL and stores the reference", async () => {
    const res = await POST(
      makeReq({ url: "https://a360.co/4vPkEVP", title: "Body v2" }),
      { params },
    );
    expect(res.status).toBe(201);
    expect(resolveFusionEmbed).toHaveBeenCalledWith("https://a360.co/4vPkEVP");
    const arg = addReference.mock.calls[0][0];
    expect(arg).toMatchObject({
      prototypeId: "p1",
      url: "https://a360.co/4vPkEVP",
      embedUrl: "https://h.autodesk360.com/g/shares/SH1?mode=embed",
      title: "Body v2",
    });
  });

  it("still stores the raw link when resolution fails (no preview)", async () => {
    resolveFusionEmbed.mockResolvedValue(null);
    const res = await POST(makeReq({ url: "https://a360.co/x" }), { params });
    expect(res.status).toBe(201);
    expect(addReference.mock.calls[0][0].embedUrl).toBeNull();
  });
});
