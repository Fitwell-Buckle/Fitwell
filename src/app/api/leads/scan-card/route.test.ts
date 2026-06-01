import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@/lib/ai/anthropic", () => ({ extractBusinessCard: vi.fn() }));

import { POST } from "@/app/api/leads/scan-card/route";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { extractBusinessCard } from "@/lib/ai/anthropic";

// next-auth's `auth` has overloaded signatures (handler vs middleware) that
// confuse vi.mocked's inference — cast through `unknown` to a plain mock.
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockPut = vi.mocked(put);
const mockExtract = vi.mocked(extractBusinessCard);

const adminSession = {
  user: { id: "u1", role: "admin", email: "a@x", name: "A" },
} as unknown as Awaited<ReturnType<typeof auth>>;

function reqWithFile(file: File | null): Request {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("http://localhost/api/leads/scan-card", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-blob-token");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/leads/scan-card", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(
      reqWithFile(new File(["x"], "x.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for supplier role", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "u1", role: "supplier", email: "s@x", name: "S" },
    } as unknown as Awaited<ReturnType<typeof auth>>);
    const res = await POST(
      reqWithFile(new File(["x"], "x.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for company role", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "u1", role: "company", email: "c@x", name: "C" },
    } as unknown as Awaited<ReturnType<typeof auth>>);
    const res = await POST(
      reqWithFile(new File(["x"], "x.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(403);
  });

  it("returns 503 when ANTHROPIC_API_KEY is unset", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockAuth.mockResolvedValueOnce(adminSession);
    const res = await POST(
      reqWithFile(new File(["x"], "x.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(503);
  });

  it("returns 503 when BLOB_READ_WRITE_TOKEN is unset", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    mockAuth.mockResolvedValueOnce(adminSession);
    const res = await POST(
      reqWithFile(new File(["x"], "x.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(503);
  });

  it("returns 400 when no file is provided", async () => {
    mockAuth.mockResolvedValueOnce(adminSession);
    const res = await POST(reqWithFile(null));
    expect(res.status).toBe(400);
  });

  it("returns 415 for unsupported mime types", async () => {
    mockAuth.mockResolvedValueOnce(adminSession);
    const res = await POST(
      reqWithFile(
        new File(["x"], "doc.pdf", { type: "application/pdf" }),
      ),
    );
    expect(res.status).toBe(415);
  });

  it("returns 413 when the upload exceeds the 10MB cap", async () => {
    mockAuth.mockResolvedValueOnce(adminSession);
    const huge = new Uint8Array(11 * 1024 * 1024);
    const res = await POST(
      reqWithFile(new File([huge], "big.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(413);
  });

  it("returns extracted fields + cardImageUrl on the happy path", async () => {
    mockAuth.mockResolvedValueOnce(adminSession);
    mockPut.mockResolvedValueOnce({
      url: "https://blob.example/leads/cards/card-abc.jpg",
    } as never);
    mockExtract.mockResolvedValueOnce({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@analytic.example",
      phone: null,
      title: "Engineer",
      companyName: "Analytical",
      website: null,
      confidence: { firstName: 0.99 },
      rawText: "Ada Lovelace",
    });

    const res = await POST(
      reqWithFile(new File(["xx"], "card.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.firstName).toBe("Ada");
    expect(body.data.cardImageUrl).toBe(
      "https://blob.example/leads/cards/card-abc.jpg",
    );
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockExtract).toHaveBeenCalledTimes(1);
    expect(mockExtract).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "image/jpeg" }),
    );
  });

  it("returns 500 when extraction throws", async () => {
    mockAuth.mockResolvedValueOnce(adminSession);
    mockPut.mockResolvedValueOnce({
      url: "https://blob.example/leads/cards/x.jpg",
    } as never);
    mockExtract.mockRejectedValueOnce(new Error("model down"));

    const res = await POST(
      reqWithFile(new File(["xx"], "card.jpg", { type: "image/jpeg" })),
    );
    expect(res.status).toBe(500);
  });
});
