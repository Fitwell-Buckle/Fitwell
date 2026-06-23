import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getGoogleAccount, ensureFreshAccessToken } = vi.hoisted(() => ({
  getGoogleAccount: vi.fn(),
  ensureFreshAccessToken: vi.fn(),
}));
vi.mock("@/lib/gmail/token", () => ({ getGoogleAccount, ensureFreshAccessToken }));

import {
  resolveFusionShare,
  triggerStlExport,
  findStlExportLink,
} from "./fusion-export";

const SIGNED =
  "https://cdn.us.oss.api.autodesk.com/oss/v2/signedresources/abc-123?region=US&x=1";

function b64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveFusionShare", () => {
  it("extracts host + shareId from the resolved autodesk360 URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        url: "https://hub99.autodesk360.com/g/shares/SH90d2dQT28",
        text: async () => "<title>Fusion</title>",
      }),
    );
    expect(await resolveFusionShare("https://a360.co/x")).toEqual({
      host: "hub99.autodesk360.com",
      shareId: "SH90d2dQT28",
      docName: "Fusion",
    });
  });

  it("returns null for a non-Autodesk destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ url: "https://evil.test/x", text: async () => "" }),
    );
    expect(await resolveFusionShare("https://evil.test/x")).toBeNull();
  });
});

describe("triggerStlExport", () => {
  it("returns the job id on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ response: { status: "success", jobId: 42 } }),
      }),
    );
    expect(await triggerStlExport("h.autodesk360.com", "SH1", "a@b.co")).toEqual({
      jobId: "42",
    });
  });

  it("throws when Autodesk doesn't return success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ response: { status: "error" } }) }),
    );
    await expect(triggerStlExport("h.autodesk360.com", "SH1", "a@b.co")).rejects.toThrow();
  });
});

describe("findStlExportLink", () => {
  beforeEach(() => {
    getGoogleAccount.mockResolvedValue({ access_token: "x" });
    ensureFreshAccessToken.mockResolvedValue("token");
  });

  function stubGmail(message: { internalDate: string; bodyHtml: string }) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/messages?")) {
          return Promise.resolve({ ok: true, json: async () => ({ messages: [{ id: "m1" }] }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            internalDate: message.internalDate,
            payload: {
              mimeType: "text/html",
              body: { data: b64url(message.bodyHtml) },
            },
          }),
        });
      }),
    );
  }

  it("extracts the signed STL link from the export email body", async () => {
    stubGmail({ internalDate: "2000000", bodyHtml: `<a href="${SIGNED}">Download</a>` });
    expect(await findStlExportLink("u1", {})).toBe(SIGNED);
  });

  it("ignores emails older than sinceMs", async () => {
    stubGmail({ internalDate: "1000", bodyHtml: `<a href="${SIGNED}">x</a>` });
    expect(await findStlExportLink("u1", { sinceMs: 5000 })).toBeNull();
  });

  it("returns null when the mailbox isn't connected", async () => {
    getGoogleAccount.mockResolvedValue(null);
    expect(await findStlExportLink("u1", {})).toBeNull();
  });
});
