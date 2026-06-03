import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  company,
  customer,
  customerAddress,
  lead,
  order,
  priceTier,
  productionPo,
  supplier,
} from "@/lib/schema";
import { leadDisplayName } from "@/lib/crm/display";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InboundMessages } from "@/components/crm/inbound-messages";
import { CompanyPeople } from "@/components/crm/company-people";
import { CompanyHistory } from "@/components/crm/company-history";
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
  const [companyRow, tiers, peopleLeads, peopleCustomers] = await Promise.all([
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
    // People attached to this company: its leads + its Shopify customers.
    db
      .select({
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        companyName: lead.companyName,
        email: lead.email,
      })
      .from(lead)
      .where(eq(lead.companyId, id)),
    db
      .select({
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
      })
      .from(customer)
      .where(eq(customer.companyId, id)),
  ]);
  if (!companyRow) notFound();

  const peopleLeadRows = peopleLeads.map((l) => ({
    id: l.id,
    label: leadDisplayName(l),
    email: l.email,
  }));
  const peopleCustomerRows = peopleCustomers.map((c) => ({
    id: c.id,
    label: leadDisplayName({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
    }),
    email: c.email,
  }));

  // Shopify-synced addresses for the linked customer (if any). Sourced from
  // the customer.addresses[] payload on every customer sync — Shopify is the
  // source of truth here. Defaults first, then by city.
  const addresses = companyRow.customerId
    ? await db.query.customerAddress.findMany({
        where: eq(customerAddress.customerId, companyRow.customerId),
        orderBy: [desc(customerAddress.isDefault), asc(customerAddress.city)],
      })
    : [];

  // Order history = Shopify orders from every customer linked to this company
  // (its primary linked customer + any attached People customers). PO history =
  // purchase orders routed directly to this company.
  const orderCustomerIds = Array.from(
    new Set(
      [companyRow.customerId, ...peopleCustomers.map((c) => c.id)].filter(
        (x): x is string => Boolean(x),
      ),
    ),
  );
  const [orders, pos] = await Promise.all([
    orderCustomerIds.length > 0
      ? db
          .select({
            id: order.id,
            number: order.shopifyOrderNumber,
            processedAt: order.processedAt,
            totalCents: order.totalPrice,
            currency: order.currency,
            financialStatus: order.financialStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            customerFirstName: customer.firstName,
            customerLastName: customer.lastName,
            customerEmail: customer.email,
          })
          .from(order)
          .leftJoin(customer, eq(order.customerId, customer.id))
          .where(inArray(order.customerId, orderCustomerIds))
          .orderBy(desc(order.processedAt))
          .limit(50)
      : Promise.resolve([]),
    db
      .select({
        id: productionPo.id,
        poNumber: productionPo.shopifyPoNumber,
        issuedDate: productionPo.issuedDate,
        expectedDeliveryDate: productionPo.expectedDeliveryDate,
        status: productionPo.status,
        supplierName: supplier.name,
      })
      .from(productionPo)
      .leftJoin(supplier, eq(productionPo.supplierId, supplier.id))
      .where(eq(productionPo.companyId, companyRow.id))
      .orderBy(desc(productionPo.issuedDate)),
  ]);

  const orderRows = orders.map((o) => ({
    id: o.id,
    number: o.number,
    processedAt: o.processedAt,
    totalCents: o.totalCents,
    currency: o.currency,
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    customerName: leadDisplayName({
      firstName: o.customerFirstName,
      lastName: o.customerLastName,
      email: o.customerEmail,
    }),
  }));

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
        addresses={addresses.map((a) => ({
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          company: a.company,
          address1: a.address1,
          address2: a.address2,
          city: a.city,
          province: a.province,
          provinceCode: a.provinceCode,
          zip: a.zip,
          country: a.country,
          phone: a.phone,
          isDefault: a.isDefault,
        }))}
        priceTiers={tiers}
      />

      <CompanyPeople
        companyId={companyRow.id}
        leads={peopleLeadRows}
        customers={peopleCustomerRows}
        primary={
          companyRow.primaryContactId && companyRow.primaryContactKind
            ? {
                kind: companyRow.primaryContactKind as "lead" | "customer",
                id: companyRow.primaryContactId,
              }
            : null
        }
      />

      <CompanyHistory orders={orderRows} pos={pos} />

      <InboundMessages
        emails={[
          companyRow.contactEmail,
          ...companyRow.contacts.map((c) => c.email),
        ].filter((e): e is string => Boolean(e))}
        relationship="b2b_customer"
      />
    </div>
  );
}
