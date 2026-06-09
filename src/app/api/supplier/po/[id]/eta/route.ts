import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionStageAssignment } from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { setSubPoEta } from "@/lib/production/service";
import { notifyPoUpdate } from "@/lib/production/notifications";
import { supplierHasAnyStage } from "@/lib/production/stage-owners";
import { getStageOrder } from "@/lib/production/stage-labels";

const bodySchema = z.object({
  expectedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

/**
 * Supplier-facing twin of /api/production/po/[id]/eta. Any supplier with a
 * stake in the PO can keep the date current — the primary supplier (the one
 * delivering) and any stage owner routed to one of its stages. Standalone
 * POs and sub-POs both pass through; master POs are rejected because on a
 * multi-supplier split each sub-PO carries its own date and the master has
 * no single value to set.
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

  // Allow either the PO's primary supplier OR a supplier assigned to one of
  // its stages. Mirrors the access check on the supplier PO detail page.
  let allowed = po.supplierId === scope.supplierId;
  if (!allowed) {
    const assignments = await db
      .select({
        stage: productionStageAssignment.stage,
        supplierId: productionStageAssignment.supplierId,
      })
      .from(productionStageAssignment)
      .where(eq(productionStageAssignment.poId, id));
    const order = await getStageOrder();
    allowed = supplierHasAnyStage(order, assignments, po.supplierId, scope.supplierId);
  }
  if (!allowed) {
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
  // Notify the admins (in-app + email). auth() here just to pick up the user's
  // display name — getSupplierScope already verified the supplier role.
  const session = await auth();
  await notifyPoUpdate({
    poId: id,
    summary: input.expectedDeliveryDate
      ? `Set expected delivery to ${input.expectedDeliveryDate}`
      : "Cleared expected delivery date",
    actor: {
      role: "supplier",
      name: session?.user?.name ?? null,
      supplierId: scope.supplierId,
    },
  });
  return NextResponse.json({ data: { id } });
}
