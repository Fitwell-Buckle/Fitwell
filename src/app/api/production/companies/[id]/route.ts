import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import {
  detectCompanyConflict,
  companyConflictMessage,
} from "@/lib/b2b/company-conflict";
import { companySchema } from "../_schema";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let input;
  try {
    input = companySchema.partial().parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (input.name !== undefined || input.contactEmail !== undefined) {
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
      id,
    );
    if (conflict) {
      const value = conflict === "name" ? input.name ?? "" : input.contactEmail ?? "";
      return NextResponse.json(
        { error: companyConflictMessage(conflict, value) },
        { status: 409 },
      );
    }
  }

  try {
    const [updated] = await db
      .update(company)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contactName !== undefined
          ? { contactName: input.contactName || null }
          : {}),
        ...(input.contactEmail !== undefined
          ? { contactEmail: input.contactEmail || null }
          : {}),
        ...(input.address !== undefined
          ? { address: input.address || null }
          : {}),
        ...(input.customerId !== undefined
          ? { customerId: input.customerId || null }
          : {}),
        ...(input.priceTierId !== undefined
          ? { priceTierId: input.priceTierId || null }
          : {}),
        ...(input.assignedCollectionIds !== undefined
          ? { assignedCollectionIds: input.assignedCollectionIds ?? [] }
          : {}),
        ...(input.assignedProductIds !== undefined
          ? { assignedProductIds: input.assignedProductIds ?? [] }
          : {}),
        ...(input.depositPercent !== undefined
          ? { depositPercent: input.depositPercent ?? 0 }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(company.id, id))
      .returning({ id: company.id });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update company failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
