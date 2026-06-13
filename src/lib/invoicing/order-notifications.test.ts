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

import { notifyNewB2bOrder } from "./order-notifications";

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
