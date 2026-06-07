import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier, supplierContact } from "@/lib/schema";
import { supplierSchema } from "./_schema";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input;
  try {
    input = supplierSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const [created] = await db
      .insert(supplier)
      .values({
        name: input.name,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        phone: input.phone || null,
        shippingAddress: input.shippingAddress || null,
        notes: input.notes || null,
      })
      .returning({ id: supplier.id });

    // The supplier's contact_email is auto-promoted to an authorized login so
    // admins don't fall into the gap where they set the contact email and the
    // supplier never receives the magic link. Idempotent via the email
    // uniqueness index — if the address already exists on another supplier
    // (rare), we leave the existing row alone and skip the insert.
    const loginEmail = input.contactEmail?.trim().toLowerCase();
    if (loginEmail) {
      await db
        .insert(supplierContact)
        .values({
          supplierId: created.id,
          email: loginEmail,
          name: input.contactName?.trim() || null,
        })
        .onConflictDoNothing({ target: supplierContact.email });
    }

    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create supplier failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
