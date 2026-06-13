import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, createInvoice, resolveOrderShipTos } = vi.hoisted(() => ({
  auth: vi.fn(),
  createInvoice: vi.fn().mockResolvedValue({ id: "inv1", invoiceNumber: "INV-00100" }),
  resolveOrderShipTos: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/portal/addresses", () => ({
  resolveOrderShipTos,
  shipToToShopify: vi.fn(),
  shipToLabel: vi.fn(),
  getCompanyAddresses: vi.fn(),
}));
// Keep the real zod schemas (the route parses with them); only stub createInvoice.
vi.mock("@/lib/invoicing/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoicing/service")>()),
  createInvoice,
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const body = {
  companyId: "co1",
  issuedDate: "2026-06-13",
  addressId: "addrPrimary",
  lineItems: [
    {
      sku: "A",
      title: "Buckle A",
      quantity: 2,
      unitPriceCents: 4000,
      shopifyProductId: "p1",
      shopifyVariantId: "v1",
      addressId: "addrB",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "u1" } });
  createInvoice.mockResolvedValue({ id: "inv1", invoiceNumber: "INV-00100" });
  resolveOrderShipTos.mockResolvedValue({
    orderShipTo: { addressId: "addrPrimary", address1: "1 HQ St" },
    lineShipTos: [{ addressId: "addrB", address1: "9 Dock Rd" }],
  });
});

describe("POST /api/invoices — ship-to resolution", () => {
  it("403s suppliers", async () => {
    auth.mockResolvedValue({ user: { role: "supplier" } });
    const res = await POST(makeReq(body));
    expect(res.status).toBe(403);
  });

  it("resolves the chosen addresses and threads ship-to into createInvoice", async () => {
    const res = await POST(makeReq(body));
    expect(res.status).toBe(201);

    expect(resolveOrderShipTos).toHaveBeenCalledWith("co1", "addrPrimary", ["addrB"]);
    const arg = createInvoice.mock.calls[0][0];
    expect(arg.shipTo).toEqual({ addressId: "addrPrimary", address1: "1 HQ St" });
    expect(arg.lineItems[0].shipTo).toEqual({ addressId: "addrB", address1: "9 Dock Rd" });
    // addressId is stripped from what createInvoice receives.
    expect(arg.lineItems[0]).not.toHaveProperty("addressId");
    expect(arg).not.toHaveProperty("addressId");
  });
});
