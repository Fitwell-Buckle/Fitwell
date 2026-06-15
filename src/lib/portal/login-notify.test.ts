import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirstContact, findFirstCompany, notifyB2bLogin } = vi.hoisted(() => ({
  findFirstContact: vi.fn(),
  findFirstCompany: vi.fn(),
  notifyB2bLogin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      companyContact: { findFirst: findFirstContact },
      company: { findFirst: findFirstCompany },
    },
  },
}));
vi.mock("@/lib/schema", () => ({ companyContact: {}, company: {} }));
vi.mock("@/lib/invoicing/order-notifications", () => ({ notifyB2bLogin }));

import { maybeNotifyPortalLogin } from "./login-notify";

beforeEach(() => vi.clearAllMocks());

describe("maybeNotifyPortalLogin", () => {
  it("notifies (lowercased) when the email is a company contact", async () => {
    findFirstContact.mockResolvedValue({ companyId: "co1" });
    findFirstCompany.mockResolvedValue({ name: "Acme" });
    await maybeNotifyPortalLogin("Buyer@Acme.co");
    expect(notifyB2bLogin).toHaveBeenCalledWith({
      companyId: "co1",
      companyName: "Acme",
      email: "buyer@acme.co",
    });
  });

  it("no-op for a non-company email (admin / supplier)", async () => {
    findFirstContact.mockResolvedValue(undefined);
    await maybeNotifyPortalLogin("admin@fitwell.co");
    expect(notifyB2bLogin).not.toHaveBeenCalled();
  });

  it("no-op (no DB hit) for an empty email", async () => {
    await maybeNotifyPortalLogin(null);
    expect(findFirstContact).not.toHaveBeenCalled();
    expect(notifyB2bLogin).not.toHaveBeenCalled();
  });
});
