import { NextResponse } from "next/server";
import { or, ilike, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customer } from "@/lib/schema";

export interface CustomerMatch {
  id: string;
  name: string;
  email: string | null;
}

// Typeahead over the synced Shopify customer list (name or email).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const like = `%${q}%`;
  const rows = await db
    .select({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
    })
    .from(customer)
    .where(
      or(
        ilike(customer.email, like),
        ilike(customer.firstName, like),
        ilike(customer.lastName, like),
        sql`coalesce(${customer.firstName}, '') || ' ' || coalesce(${customer.lastName}, '') ilike ${like}`,
      ),
    )
    .limit(10);

  const data: CustomerMatch[] = rows.map((r) => ({
    id: r.id,
    name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || (r.email ?? "Unknown"),
    email: r.email,
  }));

  return NextResponse.json({ data });
}
