import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { setPoStageEta } from "@/lib/production/service";
import { notifyPoUpdate } from "@/lib/production/notifications";
import { getStageLabels } from "@/lib/production/stage-labels";

const bodySchema = z.object({
  stage: z.string().min(1),
  targetEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

/**
 * Set (or clear) a (sub-)PO's per-stage target end date. Used by the
 * production timeline's inline editor; the timeline overrides the cycle-time
 * projection with this value when present. Admin-only — suppliers hit the
 * supplier-portal twin at /api/supplier/po/[id]/stage-eta.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
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
    columns: { id: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await setPoStageEta(id, input.stage, input.targetEndDate);

  // Use the stage's display label in the notification so the email reads
  // "Set EDM target to 2026-07-15" instead of the raw `edm` key.
  const labels = await getStageLabels();
  const stageDisplay = labels[input.stage] ?? input.stage;
  await notifyPoUpdate({
    poId: id,
    summary: input.targetEndDate
      ? `Set ${stageDisplay} target to ${input.targetEndDate}`
      : `Cleared ${stageDisplay} target date`,
    actor: {
      role: session.user.role,
      name: session.user.name,
      supplierId: session.user.supplierId,
    },
  });

  return NextResponse.json({ data: { id, stage: input.stage } });
}
