import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  company,
  companyAttachment,
  customer,
  customerAddress,
  invoice,
  lead,
  order,
  priceTier,
  productionAttachment,
  productionPo,
  supplier,
  user,
} from "@/lib/schema";
import { leadDisplayName } from "@/lib/crm/display";
import { formatPoNumber } from "@/lib/production/sub-po";
import { getShopifyClient } from "@/lib/shopify/client";
import { PageHeader } from "@/components/ui/page-header";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { InboundMessages } from "@/components/crm/inbound-messages";
import { CompanyPeople } from "@/components/crm/company-people";
import { CompanyHistory } from "@/components/crm/company-history";
import {
  CompanyDocuments,
  type CompanyDoc,
  type PoDoc,
} from "@/components/crm/company-documents";
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

  // Every Shopify customer linked to this company: its primary linked customer
  // (company.customerId) PLUS any attached People customers (customer.companyId).
  // Used for BOTH the addresses tab and the Shopify order history, so a customer
  // attached via People (not the company's single "Shopify link") still shows.
  const linkedCustomerIds = Array.from(
    new Set(
      [companyRow.customerId, ...peopleCustomers.map((c) => c.id)].filter(
        (x): x is string => Boolean(x),
      ),
    ),
  );

  // Shopify-synced addresses across all linked customers (defaults first).
  const synced = linkedCustomerIds.length
    ? await db.query.customerAddress.findMany({
        where: inArray(customerAddress.customerId, linkedCustomerIds),
        orderBy: [desc(customerAddress.isDefault), asc(customerAddress.city)],
      })
    : [];

  type AddressRow = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    provinceCode: string | null;
    zip: string | null;
    country: string | null;
    phone: string | null;
    isDefault: boolean | null;
  };

  let addresses: AddressRow[] = synced.map((a) => ({
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
  }));

  // Self-heal a sync gap: if nothing is synced yet for the linked customers,
  // pull their addresses live from Shopify so the tab still reflects Shopify
  // (read-only — the customer sync / backfill will persist them later).
  if (addresses.length === 0 && linkedCustomerIds.length > 0) {
    const linkedShopifyIds = (
      await db
        .select({ shopifyId: customer.shopifyId })
        .from(customer)
        .where(inArray(customer.id, linkedCustomerIds))
    )
      .map((r) => r.shopifyId)
      .filter((x): x is string => Boolean(x));

    if (linkedShopifyIds.length > 0) {
      const client = getShopifyClient();
      const live: AddressRow[] = [];
      for (const sid of linkedShopifyIds) {
        try {
          const c = await client.getCustomer(sid);
          const arr =
            c.addresses && c.addresses.length > 0
              ? c.addresses
              : c.default_address
                ? [{ ...c.default_address, default: true }]
                : [];
          const defaultId = c.default_address?.id;
          for (const a of arr) {
            live.push({
              id: a.id != null ? String(a.id) : `${sid}-${live.length}`,
              firstName: a.first_name ?? null,
              lastName: a.last_name ?? null,
              company: a.company ?? null,
              address1: a.address1 ?? null,
              address2: a.address2 ?? null,
              city: a.city ?? null,
              province: a.province ?? null,
              provinceCode: a.province_code ?? null,
              zip: a.zip ?? null,
              country: a.country ?? null,
              phone: a.phone ?? null,
              isDefault:
                a.default === true || (defaultId != null && a.id === defaultId),
            });
          }
        } catch (err) {
          console.error("live Shopify address fetch failed:", err);
        }
      }
      addresses = live;
    }
  }

  // Order history = Shopify orders from those linked customers. PO history =
  // purchase orders routed to this company. Invoices = platform B2B invoices
  // (INV-…) raised for this company (separate from Shopify orders).
  const [orders, pos, invoices] = await Promise.all([
    linkedCustomerIds.length > 0
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
          .where(inArray(order.customerId, linkedCustomerIds))
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
    db
      .select({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        totalCents: invoice.totalCents,
        currency: invoice.currency,
        issuedDate: invoice.issuedDate,
      })
      .from(invoice)
      .where(eq(invoice.companyId, companyRow.id))
      .orderBy(desc(invoice.createdAt)),
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

  // Documents for the Activity tab: PO-level attachments from this company's POs
  // (read-only) + documents uploaded directly to the company.
  const poNumberById = new Map(pos.map((p) => [p.id, formatPoNumber(p.poNumber)]));
  const poIds = pos.map((p) => p.id);
  const [poAttachmentRows, companyDocRows] = await Promise.all([
    poIds.length > 0
      ? db
          .select({
            id: productionAttachment.id,
            filename: productionAttachment.filename,
            blobUrl: productionAttachment.blobUrl,
            sizeBytes: productionAttachment.sizeBytes,
            poId: productionAttachment.poId,
          })
          .from(productionAttachment)
          .where(inArray(productionAttachment.poId, poIds))
          .orderBy(desc(productionAttachment.uploadedAt))
      : Promise.resolve([]),
    db
      .select({
        id: companyAttachment.id,
        filename: companyAttachment.filename,
        blobUrl: companyAttachment.blobUrl,
        sizeBytes: companyAttachment.sizeBytes,
        uploadedByName: user.name,
      })
      .from(companyAttachment)
      .leftJoin(user, eq(companyAttachment.uploadedByUserId, user.id))
      .where(eq(companyAttachment.companyId, companyRow.id))
      .orderBy(desc(companyAttachment.uploadedAt)),
  ]);
  const poDocs: PoDoc[] = poAttachmentRows
    .filter((a) => a.poId)
    .map((a) => ({
      id: a.id,
      filename: a.filename,
      url: a.blobUrl,
      sizeBytes: a.sizeBytes,
      poId: a.poId as string,
      poNumber: poNumberById.get(a.poId as string) ?? "PO",
    }));
  const companyDocs: CompanyDoc[] = companyDocRows.map((d) => ({
    id: d.id,
    filename: d.filename,
    url: d.blobUrl,
    sizeBytes: d.sizeBytes,
    uploadedBy: d.uploadedByName ?? null,
  }));

  const overview = (
    <>
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
          allowWirePayment: companyRow.allowWirePayment ?? false,
          notes: companyRow.notes,
          assignedCollectionIds: companyRow.assignedCollectionIds ?? [],
          assignedProductIds: companyRow.assignedProductIds ?? [],
        }}
        contacts={companyRow.contacts.map((c) => ({
          id: c.id,
          email: c.email,
          name: c.name,
        }))}
        addresses={addresses}
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

      <CompanyHistory orders={orderRows} pos={pos} invoices={invoices} />

      <InboundMessages
        emails={[
          companyRow.contactEmail,
          ...companyRow.contacts.map((c) => c.email),
        ].filter((e): e is string => Boolean(e))}
        relationship="b2b_customer"
      />
    </>
  );

  return (
    <div>
      <PageHeader title={companyRow.name} />
      <DetailTabs
        tabs={[
          { value: "overview", label: "Overview", content: overview },
          {
            value: "activity",
            label: "Activity",
            content: (
              <CompanyDocuments
                companyId={companyRow.id}
                companyDocs={companyDocs}
                poDocs={poDocs}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
