import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
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

  try {
    const [created] = await db
      .insert(company)
      .values({
        name: input.name,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        customerId: input.customerId || null,
        priceTierId: input.priceTierId || null,
        assignedCollectionIds: input.assignedCollectionIds ?? [],
        assignedProductIds: input.assignedProductIds ?? [],
        depositPercent: input.depositPercent ?? 0,
        notes: input.notes || null,
      })
      .returning({ id: company.id });
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create company failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
