import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, customerAddress, priceTier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InboundMessages } from "@/components/crm/inbound-messages";
import { CustomerDetailView } from "./customer-detail-view";

export const metadata: Metadata = {
  title: "B2B customer | Fitwell Admin",
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const [companyRow, tiers] = await Promise.all([
    db.query.company.findFirst({
      where: eq(company.id, id),
      with: {
        priceTier: { columns: { name: true, discountPercent: true } },
        contacts: { columns: { id: true, email: true, name: true } },
      },
    }),
    db.query.priceTier.findMany({
      columns: { id: true, name: true, discountPercent: true },
      orderBy: asc(priceTier.name),
    }),
  ]);
  if (!companyRow) notFound();

  // Shopify-synced addresses for the linked customer (if any). Sourced from
  // the customer.addresses[] payload on every customer sync — Shopify is the
  // source of truth here. Defaults first, then by city.
  const addresses = companyRow.customerId
    ? await db.query.customerAddress.findMany({
        where: eq(customerAddress.customerId, companyRow.customerId),
        orderBy: [desc(customerAddress.isDefault), asc(customerAddress.city)],
      })
    : [];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <PageHeader title={companyRow.name} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/customers/brands">Back</Link>
        </Button>
      </div>
      <CustomerDetailView
        customer={{
          id: companyRow.id,
          name: companyRow.name,
          contactName: companyRow.contactName,
          contactEmail: companyRow.contactEmail,
          address: companyRow.address,
          customerId: companyRow.customerId,
          priceTierId: companyRow.priceTierId,
          tierName: companyRow.priceTier?.name ?? null,
          tierDiscount: companyRow.priceTier?.discountPercent ?? 0,
          depositPercent: companyRow.depositPercent ?? 0,
          notes: companyRow.notes,
          assignedCollectionIds: companyRow.assignedCollectionIds ?? [],
          assignedProductIds: companyRow.assignedProductIds ?? [],
        }}
        contacts={companyRow.contacts.map((c) => ({
          id: c.id,
          email: c.email,
          name: c.name,
        }))}
        priceTiers={tiers}
      />

      <InboundMessages
        emails={[
          companyRow.contactEmail,
          ...companyRow.contacts.map((c) => c.email),
        ].filter((e): e is string => Boolean(e))}
        relationship="b2b_customer"
      />

      {companyRow.customerId && (
        <Card className="mt-5 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Shopify addresses
            </h2>
            <p className="text-xs text-zinc-400">
              Synced from the linked Shopify customer
            </p>
          </div>
          {addresses.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">
              No addresses on file. They&apos;ll appear here after the next
              customer sync from Shopify.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => {
                const name = [a.firstName, a.lastName]
                  .filter(Boolean)
                  .join(" ");
                const cityLine = [a.city, a.provinceCode ?? a.province, a.zip]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li
                    key={a.id}
                    className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">
                        {name || "—"}
                      </span>
                      {a.isDefault && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                          Default
                        </span>
                      )}
                    </div>
                    {a.company && (
                      <div className="text-xs text-zinc-500">{a.company}</div>
                    )}
                    {a.address1 && <div>{a.address1}</div>}
                    {a.address2 && <div>{a.address2}</div>}
                    {cityLine && <div>{cityLine}</div>}
                    {a.country && (
                      <div className="text-xs text-zinc-500">{a.country}</div>
                    )}
                    {a.phone && (
                      <div className="mt-1 text-xs text-zinc-500">
                        {a.phone}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
