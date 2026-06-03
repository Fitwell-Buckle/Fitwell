import { NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customer, lead } from "@/lib/schema";
import { parseEmailAddress } from "@/lib/crm/customer-match";
import { getShopifyClient } from "@/lib/shopify/client";

export const runtime = "nodejs";

// Push a lead's business-card address to Shopify as an ADDITIONAL address on the
// matching Shopify customer (matched by the lead's email). Never overwrites or
// sets a default; de-dupes in the client. Requires the `write_customers` scope.
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
  const row = await db.query.lead.findFirst({
    where: eq(lead.id, id),
    columns: {
      email: true,
      firstName: true,
      lastName: true,
      companyName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const hasAddress = Boolean(
    row.addressLine1?.trim() ||
      row.city?.trim() ||
      row.postalCode?.trim(),
  );
  if (!hasAddress) {
    return NextResponse.json(
      { error: "This lead has no business-card address to sync." },
      { status: 400 },
    );
  }

  const email = parseEmailAddress(row.email ?? "");
  if (!email) {
    return NextResponse.json(
      { error: "This lead has no email, so it can't be matched to a Shopify customer." },
      { status: 409 },
    );
  }

  const [match] = await db
    .select({ shopifyId: customer.shopifyId })
    .from(customer)
    .where(
      and(sql`lower(${customer.email}) = ${email}`, isNotNull(customer.shopifyId)),
    )
    .limit(1);
  if (!match?.shopifyId) {
    return NextResponse.json(
      {
        error:
          "No Shopify customer is linked to this lead's email — nothing to sync to.",
      },
      { status: 409 },
    );
  }

  try {
    const result = await getShopifyClient().createCustomerAddress(
      match.shopifyId,
      {
        address1: row.addressLine1,
        address2: row.addressLine2,
        city: row.city,
        province: row.region,
        zip: row.postalCode,
        country: row.country,
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.companyName,
      },
    );
    if (!result.created && result.reason === "duplicate") {
      return NextResponse.json({
        data: { created: false, message: "That address is already on the Shopify customer." },
      });
    }
    return NextResponse.json({
      data: { created: true, message: "Added to the Shopify customer's addresses." },
    });
  } catch (err) {
    console.error("sync-address failed:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't add the address in Shopify. If the app was just granted write access, sign out/in to refresh, then retry.",
      },
      { status: 502 },
    );
  }
}
