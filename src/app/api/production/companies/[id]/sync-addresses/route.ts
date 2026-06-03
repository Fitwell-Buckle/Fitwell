import { NextResponse } from "next/server";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, customer } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { upsertCustomer } from "@/lib/shopify/sync";

export const runtime = "nodejs";

// Targeted address sync for ONE B2B company: re-fetch its linked Shopify
// customers (the company's "Shopify link" customer + any People-attached
// customers) and re-run upsertCustomer, which delete-and-replaces their
// `customer_address` rows from Shopify. Persists — so the company Addresses tab
// AND invoice "Ship to" pick them up. On-demand alternative to the full backfill.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const co = await db.query.company.findFirst({
    where: eq(company.id, id),
    columns: { id: true, customerId: true },
  });
  if (!co) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Every Shopify customer linked to this company (primary link + People).
  const conds = [eq(customer.companyId, id)];
  if (co.customerId) conds.push(eq(customer.id, co.customerId));
  const linked = await db
    .select({ shopifyId: customer.shopifyId })
    .from(customer)
    .where(and(isNotNull(customer.shopifyId), or(...conds)));

  const shopifyIds = Array.from(
    new Set(linked.map((l) => l.shopifyId).filter((x): x is string => Boolean(x))),
  );
  if (shopifyIds.length === 0) {
    return NextResponse.json({
      data: { synced: 0, message: "No Shopify-linked customers to sync." },
    });
  }

  const client = getShopifyClient();
  let synced = 0;
  let failed = 0;
  for (const sid of shopifyIds) {
    try {
      const shopifyCustomer = await client.getCustomer(sid);
      await upsertCustomer(shopifyCustomer);
      synced++;
    } catch (err) {
      console.error(`sync-addresses: failed for shopify customer ${sid}`, err);
      failed++;
    }
  }

  if (synced === 0) {
    return NextResponse.json(
      {
        error:
          "Couldn't reach Shopify to sync addresses. If the app was just re-authorized, try again shortly.",
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    data: {
      synced,
      message: `Synced addresses from Shopify for ${synced} customer${synced === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}.`,
    },
  });
}
