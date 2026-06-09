import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { setSubPoEta } from "@/lib/production/service";

const bodySchema = z.object({
  expectedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

/**
 * Supplier-facing twin of /api/production/po/[id]/eta. The supplier who
 * physically delivers the goods sets the date — gated to the PO's primary
 * supplier (po.supplier_id). Standalone POs and sub-POs both pass through;
 * master POs are rejected because on a multi-supplier split each sub-PO
 * carries its own date and the master has no single value to set.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getSupplierScope();
  if (!scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, id),
    columns: { id: true, supplierId: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (po.supplierId !== scope.supplierId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Reject masters: the master's ETA is a rollup of its sub-POs, so there's
  // nothing meaningful to set at this level. Detect by looking for any child.
  const child = await db.query.productionPo.findFirst({
    where: eq(productionPo.parentPoId, id),
    columns: { id: true },
  });
  if (child) {
    return NextResponse.json(
      { error: "ETA is set per sub-PO on a multi-supplier PO." },
      { status: 409 },
    );
  }

  await setSubPoEta(id, input.expectedDeliveryDate);
  return NextResponse.json({ data: { id } });
}
