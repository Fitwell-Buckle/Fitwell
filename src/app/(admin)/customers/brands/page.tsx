import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, customer, lead, priceTier } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { CUSTOMERS_TABS } from "@/lib/nav-tabs";
import {
  countNewCustomerMessages,
  listCustomerMessages,
} from "@/lib/crm/customer-messages";
import { companyIdsWithNextSteps } from "@/lib/crm/messages";
import { leadDisplayName } from "@/lib/crm/display";
import {
  resolveCompanyContact,
  type ContactPerson,
} from "@/lib/crm/company-contact";
import { CustomerMessagesPanel } from "@/components/crm/customer-messages-panel";
import { CompaniesManager } from "./companies-manager";

export const metadata: Metadata = {
  title: "B2B Customer List | Fitwell Admin",
};

export default async function BrandsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [
    tiers,
    companies,
    peopleLeads,
    peopleCustomers,
    messages,
    counts,
    nextStepCompanyIds,
  ] = await Promise.all([
      db.query.priceTier.findMany({ orderBy: asc(priceTier.name) }),
      db.query.company.findMany({
        orderBy: asc(company.name),
        with: {
          priceTier: { columns: { name: true } },
          contacts: { columns: { id: true, email: true, name: true } },
        },
      }),
      db
        .select({
          id: lead.id,
          companyId: lead.companyId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          companyName: lead.companyName,
          email: lead.email,
        })
        .from(lead)
        .where(isNotNull(lead.companyId)),
      db
        .select({
          id: customer.id,
          companyId: customer.companyId,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
        })
        .from(customer)
        .where(isNotNull(customer.companyId)),
      listCustomerMessages("b2b"),
      countNewCustomerMessages(),
      companyIdsWithNextSteps(),
    ]);

  // Build per-company People (leads + customers) → resolve each company's
  // displayed Contact (primary person → single person → free-text).
  const peopleByCompany = new Map<string, ContactPerson[]>();
  const pushPerson = (companyId: string | null, person: ContactPerson) => {
    if (!companyId) return;
    const arr = peopleByCompany.get(companyId);
    if (arr) arr.push(person);
    else peopleByCompany.set(companyId, [person]);
  };
  for (const l of peopleLeads) {
    pushPerson(l.companyId, {
      kind: "lead",
      id: l.id,
      label: leadDisplayName(l),
      email: l.email,
    });
  }
  for (const c of peopleCustomers) {
    pushPerson(c.companyId, {
      kind: "customer",
      id: c.id,
      label: leadDisplayName({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
      }),
      email: c.email,
    });
  }

  const tabs = CUSTOMERS_TABS.map((t) => ({
    ...t,
    dot: (t.href === "/customers/brands" ? counts.b2b : counts.consumer) > 0,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <PageHeader title="Customers" />
        {/* Mirror Leads' header action: the page-level "Add B2B customer"
            entry navigates with ?new=true; CompaniesManager reads the URL
            param and opens its new-company form. */}
        <Button asChild size="sm">
          <Link href="?new=true">+ Add B2B customer</Link>
        </Button>
      </div>
      <SectionTabs tabs={tabs} />

      <CustomerMessagesPanel
        audience="b2b"
        messages={messages.map((m) => ({
          id: m.id,
          threadId: m.threadId,
          fromEmail: m.fromEmail,
          displayName: m.displayName,
          company: m.company,
          subject: m.subject,
          snippet: m.snippet,
          receivedAt: m.receivedAt ? m.receivedAt.toISOString() : null,
          mailboxLabel: m.mailboxLabel,
          mailboxEmail: m.mailboxEmail,
        }))}
      />

      <div className="mt-6">
        <CompaniesManager
          priceTiers={tiers.map((t) => ({
            id: t.id,
            name: t.name,
            discountPercent: t.discountPercent,
          }))}
          companies={companies.map((c) => {
            const resolved = resolveCompanyContact(
              c,
              peopleByCompany.get(c.id) ?? [],
            );
            return {
            id: c.id,
            name: c.name,
            contactName: c.contactName,
            contactEmail: c.contactEmail,
            // Resolved Contact shown in the list (primary person → single
            // person → free-text); the form still edits the free-text fields.
            contactLabel: resolved.name ?? resolved.email ?? null,
            hasNextStep: nextStepCompanyIds.has(c.id),
            address: c.address,
            customerId: c.customerId,
            notes: c.notes,
            priceTierId: c.priceTierId,
            tierName: c.priceTier?.name ?? null,
            assignedCollectionIds: c.assignedCollectionIds ?? [],
            assignedProductIds: c.assignedProductIds ?? [],
            depositPercent: c.depositPercent ?? 0,
            contacts: c.contacts.map((ct) => ({
              id: ct.id,
              email: ct.email,
              name: ct.name,
            })),
            };
          })}
        />
      </div>
    </div>
  );
}
