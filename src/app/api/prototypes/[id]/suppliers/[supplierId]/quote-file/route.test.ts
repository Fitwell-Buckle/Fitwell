import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, setPrototypeQuoteFile, put, del } = vi.hoisted(() => ({
  auth: vi.fn(),
  setPrototypeQuoteFile: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/prototypes/service", () => ({ setPrototypeQuoteFile }));
vi.mock("@vercel/blob", () => ({ put, del }));

import { POST, DELETE } from "./route";

const params = Promise.resolve({ id: "proto1", supplierId: "s1" });

function uploadReq(file?: File) {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new Request(
    "https://portal.fitwellbuckle.co/api/prototypes/proto1/suppliers/s1/quote-file",
    { method: "POST", body: fd },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  auth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
  put.mockResolvedValue({ url: "https://blob/quote.pdf" });
  del.mockResolvedValue(undefined);
  setPrototypeQuoteFile.mockResolvedValue({ found: true, previousUrl: null });
});

describe("POST quote-file", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await POST(uploadReq(new File(["x"], "q.pdf")), { params });
    expect(res.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("400s when no file", async () => {
    const res = await POST(uploadReq(), { params });
    expect(res.status).toBe(400);
  });

  it("uploads and stores the file on the row", async () => {
    const res = await POST(uploadReq(new File(["x"], "q.pdf")), { params });
    expect(res.status).toBe(201);
    expect(put).toHaveBeenCalled();
    expect(setPrototypeQuoteFile).toHaveBeenCalledWith("proto1", "s1", {
      url: "https://blob/quote.pdf",
      name: "q.pdf",
    });
    expect((await res.json()).data.url).toBe("https://blob/quote.pdf");
  });

  it("deletes the orphaned blob and 404s when the vendor isn't a candidate", async () => {
    setPrototypeQuoteFile.mockResolvedValue({ found: false, previousUrl: null });
    const res = await POST(uploadReq(new File(["x"], "q.pdf")), { params });
    expect(res.status).toBe(404);
    expect(del).toHaveBeenCalledWith("https://blob/quote.pdf");
  });

  it("drops the previous blob when replacing", async () => {
    setPrototypeQuoteFile.mockResolvedValue({
      found: true,
      previousUrl: "https://blob/old.pdf",
    });
    await POST(uploadReq(new File(["x"], "q.pdf")), { params });
    expect(del).toHaveBeenCalledWith("https://blob/old.pdf");
  });
});

describe("DELETE quote-file", () => {
  it("removes the file and its blob", async () => {
    setPrototypeQuoteFile.mockResolvedValue({
      found: true,
      previousUrl: "https://blob/quote.pdf",
    });
    const res = await DELETE(uploadReq(), { params });
    expect(res.status).toBe(200);
    expect(setPrototypeQuoteFile).toHaveBeenCalledWith("proto1", "s1", null);
    expect(del).toHaveBeenCalledWith("https://blob/quote.pdf");
  });

  it("404s when the vendor isn't a candidate", async () => {
    setPrototypeQuoteFile.mockResolvedValue({ found: false, previousUrl: null });
    const res = await DELETE(uploadReq(), { params });
    expect(res.status).toBe(404);
  });
});
