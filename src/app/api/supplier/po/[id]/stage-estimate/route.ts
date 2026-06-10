import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionStageAssignment } from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { setPoStageEstimate } from "@/lib/production/service";
import { notifyPoUpdate } from "@/lib/production/notifications";
import { supplierHasAnyStage } from "@/lib/production/stage-owners";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";

const bodySchema = z.object({
  stage: z.string().min(1),
  days: z.number().int().min(0).max(3650).nullable(),
});

/**
 * Supplier-facing twin of /api/production/po/[id]/stage-estimate. Any
 * supplier with a stake in the PO can edit the per-stage day estimate
 * (since they're often the source of truth on how long stamping/QC will
 * actually take). Mirrors the access check on /supplier/po/[id].
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

  await setPoStageEstimate(id, input.stage, input.days);

  const labels = await getStageLabels();
  const stageDisplay = labels[input.stage] ?? input.stage;
  const session = await auth();
  await notifyPoUpdate({
    poId: id,
    summary:
      input.days != null
        ? `Set ${stageDisplay} estimate to ${input.days} days`
        : `Cleared ${stageDisplay} estimate`,
    actor: {
      role: "supplier",
      name: session?.user?.name ?? null,
      supplierId: scope.supplierId,
    },
  });

  return NextResponse.json({ data: { id, stage: input.stage } });
}
