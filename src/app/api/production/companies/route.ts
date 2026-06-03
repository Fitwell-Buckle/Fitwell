import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import {
  detectCompanyConflict,
  companyConflictMessage,
} from "@/lib/b2b/company-conflict";
import { attachPrimaryContactByEmail } from "@/lib/b2b/attach-contact";
import { companySchema } from "./_schema";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input;
  try {
    input = companySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const existing = await db
    .select({
      id: company.id,
      name: company.name,
      contactEmail: company.contactEmail,
    })
    .from(company);
  const conflict = detectCompanyConflict(
    { name: input.name, contactEmail: input.contactEmail || null },
    existing,
  );
  if (conflict) {
    const value = conflict === "name" ? input.name : input.contactEmail ?? "";
    return NextResponse.json(
      { error: companyConflictMessage(conflict, value) },
      { status: 409 },
    );
  }

  try {
    const [created] = await db
      .insert(company)
      .values({
        name: input.name,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        address: input.address || null,
        customerId: input.customerId || null,
        priceTierId: input.priceTierId || null,
        assignedCollectionIds: input.assignedCollectionIds ?? [],
        assignedProductIds: input.assignedProductIds ?? [],
        depositPercent: input.depositPercent ?? 0,
        notes: input.notes || null,
      })
      .returning({ id: company.id });

    // If a contact email was given (e.g. creating the company from a lead),
    // auto-attach the matching person as the primary contact — best-effort, so
    // a hiccup here never blocks company creation.
    try {
      await attachPrimaryContactByEmail(created.id, input.contactEmail);
    } catch (err) {
      console.error("auto-attach primary contact failed:", err);
    }

    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create company failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
