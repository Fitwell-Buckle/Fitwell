import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { dbInsert, dbValues, sendEmail } = vi.hoisted(() => {
  const dbValues = vi.fn().mockResolvedValue(undefined);
  return {
    dbValues,
    dbInsert: vi.fn(() => ({ values: dbValues })),
    sendEmail: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/db", () => ({ db: { insert: dbInsert } }));
vi.mock("@/lib/schema", () => ({ adminNotification: { type: "type", readAt: "readAt" } }));
vi.mock("@/lib/email/resend", () => ({ sendEmail }));

import {
  notifyNewB2bOrder,
  notifyB2bPayment,
  notifyB2bDraft,
  notifyB2bLogin,
} from "./order-notifications";

const order = {
  invoiceId: "inv1",
  invoiceNumber: "INV-00100",
  companyName: "Acme",
  totalCents: 6000,
  paymentMethod: "wire" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_EMAILS = "greg@x.co, tom@x.co , oliver@x.co";
  process.env.RESEND_API_KEY = "re_test";
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
});

describe("notifyNewB2bOrder", () => {
  it("records a b2b_order admin notification linking to the invoice", async () => {
    await notifyNewB2bOrder(order);
    expect(dbInsert).toHaveBeenCalled();
    const row = dbValues.mock.calls[0][0];
    expect(row.type).toBe("b2b_order");
    expect(row.href).toBe("/invoices/inv1");
    expect(row.title).toContain("INV-00100");
    expect(row.title).toContain("Acme");
  });

  it("emails the admins (ADMIN_EMAILS, trimmed)", async () => {
    await notifyNewB2bOrder(order);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toEqual(["greg@x.co", "tom@x.co", "oliver@x.co"]);
    expect(arg.subject).toContain("INV-00100");
    expect(arg.html).toContain("/invoices/inv1");
  });

  it("still records the notification but skips email when no admins configured", async () => {
    process.env.ADMIN_EMAILS = "";
    await notifyNewB2bOrder(order);
    expect(dbInsert).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("doesn't send (logs) when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await notifyNewB2bOrder(order);
    expect(dbInsert).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("notifyB2bPayment", () => {
  it("records a b2b_payment notification with the kind label + emails admins", async () => {
    await notifyB2bPayment({
      invoiceId: "inv1",
      invoiceNumber: "INV-00100",
      companyName: "Acme",
      amountCents: 2000,
      kind: "deposit",
    });
    const row = dbValues.mock.calls[0][0];
    expect(row.type).toBe("b2b_payment");
    expect(row.href).toBe("/invoices/inv1");
    expect(row.title).toContain("Deposit");
    expect(row.title).toContain("INV-00100");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("labels a full payment without 'deposit'/'balance'", async () => {
    await notifyB2bPayment({
      invoiceId: "inv1",
      invoiceNumber: "INV-00100",
      companyName: "Acme",
      amountCents: 6000,
      kind: "full",
    });
    expect(dbValues.mock.calls[0][0].title).toContain("Payment received");
  });
});

describe("notifyB2bDraft", () => {
  it("records a b2b_draft notification linking to the invoice", async () => {
    await notifyB2bDraft({ invoiceId: "inv1", invoiceNumber: "INV-00100", companyName: "Acme" });
    const row = dbValues.mock.calls[0][0];
    expect(row.type).toBe("b2b_draft");
    expect(row.href).toBe("/invoices/inv1");
    expect(row.title).toContain("Acme");
  });
});

describe("notifyB2bLogin", () => {
  it("records a b2b_login notification linking to the customer page", async () => {
    await notifyB2bLogin({ companyId: "co1", companyName: "Acme", email: "buyer@acme.co" });
    const row = dbValues.mock.calls[0][0];
    expect(row.type).toBe("b2b_login");
    expect(row.href).toBe("/customers/brands/co1");
    expect(row.body).toContain("buyer@acme.co");
  });
});
