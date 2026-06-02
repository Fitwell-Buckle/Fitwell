import { NextResponse } from "next/server";
import { ilike, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customer, lead } from "@/lib/schema";
import { leadDisplayName } from "@/lib/crm/display";

export const runtime = "nodejs";

// Typeahead over people (leads + Shopify customers) to attach to a B2B company.
// Matches name / email / company on a `q` of >=2 chars; returns up to ~8 of
// each, tagged with kind + their current companyId (so the UI can show what's
// already linked elsewhere).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ data: { results: [] } });
  }
  const like = `%${q}%`;

  const [leads, customers] = await Promise.all([
    db
      .select({
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        companyName: lead.companyName,
        companyId: lead.companyId,
      })
      .from(lead)
      .where(
        or(
          ilike(lead.firstName, like),
          ilike(lead.lastName, like),
          ilike(lead.email, like),
          ilike(lead.companyName, like),
        ),
      )
      .limit(8),
    db
      .select({
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        companyId: customer.companyId,
      })
      .from(customer)
      .where(
        or(
          ilike(customer.firstName, like),
          ilike(customer.lastName, like),
          ilike(customer.email, like),
        ),
      )
      .limit(8),
  ]);

  const results = [
    ...leads.map((l) => ({
      kind: "lead" as const,
      id: l.id,
      label: leadDisplayName(l),
      sublabel: l.email ?? l.companyName ?? null,
      companyId: l.companyId,
    })),
    ...customers.map((c) => ({
      kind: "customer" as const,
      id: c.id,
      label: leadDisplayName({ firstName: c.firstName, lastName: c.lastName, email: c.email }),
      sublabel: c.email ?? null,
      companyId: c.companyId,
    })),
  ];

  return NextResponse.json({ data: { results } });
}
