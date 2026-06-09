import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionStageAssignment } from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { setPoStageEta } from "@/lib/production/service";
import { notifyPoUpdate } from "@/lib/production/notifications";
import { supplierHasAnyStage } from "@/lib/production/stage-owners";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";

const bodySchema = z.object({
  stage: z.string().min(1),
  targetEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

/**
 * Supplier-facing twin of /api/production/po/[id]/stage-eta. Any supplier
 * with a stake in the PO (primary supplier OR routed to one of its stages)
 * can edit the per-stage target dates — mirrors the page-level access check
 * on /supplier/po/[id] and the eta-route equivalent.
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

  await setPoStageEta(id, input.stage, input.targetEndDate);

  const labels = await getStageLabels();
  const stageDisplay = labels[input.stage] ?? input.stage;
  const session = await auth();
  await notifyPoUpdate({
    poId: id,
    summary: input.targetEndDate
      ? `Set ${stageDisplay} target to ${input.targetEndDate}`
      : `Cleared ${stageDisplay} target date`,
    actor: {
      role: "supplier",
      name: session?.user?.name ?? null,
      supplierId: scope.supplierId,
    },
  });

  return NextResponse.json({ data: { id, stage: input.stage } });
}
