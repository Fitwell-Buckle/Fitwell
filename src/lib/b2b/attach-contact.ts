import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { company, customer, lead } from "@/lib/schema";
import { parseEmailAddress } from "@/lib/crm/customer-match";

// When a company is created from a person's contact email (e.g. "turning a lead
// into a company"), attach that person automatically so the company doesn't
// start with an empty People list. Finds an UNLINKED match by email — a lead
// first (sales context), else a Shopify customer — links it (sets company_id)
// and makes it the company's primary contact. Only touches a match whose
// company_id is null, so it never steals a person from another company.
// Returns what it attached, or null if there was no match.
export async function attachPrimaryContactByEmail(
  companyId: string,
  email: string | null | undefined,
): Promise<{ kind: "lead" | "customer"; id: string } | null> {
  const norm = email ? parseEmailAddress(email) : null;
  if (!norm) return null;

  const [leadMatch] = await db
    .select({ id: lead.id })
    .from(lead)
    .where(and(sql`lower(${lead.email}) = ${norm}`, isNull(lead.companyId)))
    .limit(1);
  if (leadMatch) {
    await db
      .update(lead)
      .set({ companyId })
      .where(eq(lead.id, leadMatch.id));
    await db
      .update(company)
      .set({ primaryContactKind: "lead", primaryContactId: leadMatch.id })
      .where(eq(company.id, companyId));
    return { kind: "lead", id: leadMatch.id };
  }

  const [custMatch] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(
      and(sql`lower(${customer.email}) = ${norm}`, isNull(customer.companyId)),
    )
    .limit(1);
  if (custMatch) {
    await db
      .update(customer)
      .set({ companyId })
      .where(eq(customer.id, custMatch.id));
    await db
      .update(company)
      .set({ primaryContactKind: "customer", primaryContactId: custMatch.id })
      .where(eq(company.id, companyId));
    return { kind: "customer", id: custMatch.id };
  }

  return null;
}
