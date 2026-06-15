import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyContact, company } from "@/lib/schema";
import { notifyB2bLogin } from "@/lib/invoicing/order-notifications";

/**
 * If `email` belongs to a B2B company contact, notify admins that they signed
 * in to the portal (in-app + push + email). No-op for admins/suppliers (not a
 * company contact). Best-effort — callers wrap it so it never blocks sign-in.
 * Lives apart from auth.ts so it's unit-testable without loading NextAuth.
 */
export async function maybeNotifyPortalLogin(email: string | null | undefined): Promise<void> {
  const addr = email?.toLowerCase().trim();
  if (!addr) return;
  const contact = await db.query.companyContact.findFirst({
    where: eq(companyContact.email, addr),
    columns: { companyId: true },
  });
  if (!contact) return;
  const comp = await db.query.company.findFirst({
    where: eq(company.id, contact.companyId),
    columns: { name: true },
  });
  await notifyB2bLogin({
    companyId: contact.companyId,
    companyName: comp?.name ?? "—",
    email: addr,
  });
}
