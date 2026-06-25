import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, getCadModel, processSourceModel } = vi.hoisted(() => ({
  auth: vi.fn(),
  getCadModel: vi.fn(),
  processSourceModel: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/cad/service", () => ({ getCadModel, processSourceModel }));

import { POST } from "./route";

const params = Promise.resolve({ id: "m1" });

function reqWith(file?: File) {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new Request("https://portal.fitwellbuckle.co/api/cad-models/m1/stl", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  getCadModel.mockResolvedValue({ id: "m1", name: "X" });
  processSourceModel.mockResolvedValue({ glbUrl: "https://blob/model.glb" });
});

describe("POST /api/cad-models/[id]/stl", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await POST(reqWith(new File(["x"], "a.stl")), { params });
    expect(res.status).toBe(403);
  });

  it("404s an unknown model", async () => {
    getCadModel.mockResolvedValue(null);
    const res = await POST(reqWith(new File(["x"], "a.stl")), { params });
    expect(res.status).toBe(404);
  });

  it("400s when no file is provided", async () => {
    const res = await POST(reqWith(), { params });
    expect(res.status).toBe(400);
    expect(processSourceModel).not.toHaveBeenCalled();
  });

  it("400s an unsupported file type", async () => {
    const res = await POST(reqWith(new File(["x"], "model.png")), { params });
    expect(res.status).toBe(400);
    expect(processSourceModel).not.toHaveBeenCalled();
  });

  it("converts a valid STL and returns the glb url", async () => {
    const res = await POST(reqWith(new File(["x"], "buckle.stl")), { params });
    expect(res.status).toBe(201);
    expect(processSourceModel).toHaveBeenCalled();
    expect((await res.json()).data.glbUrl).toBe("https://blob/model.glb");
  });

  it("accepts an OBJ file too", async () => {
    const res = await POST(reqWith(new File(["x"], "buckle.obj")), { params });
    expect(res.status).toBe(201);
    expect(processSourceModel).toHaveBeenCalled();
  });

  it("422s when conversion throws", async () => {
    processSourceModel.mockRejectedValue(new Error("Not a valid binary STL."));
    const res = await POST(reqWith(new File(["x"], "bad.stl")), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/STL/);
  });
});
