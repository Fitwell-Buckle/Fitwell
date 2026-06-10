import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { setPoStageEstimate } from "@/lib/production/service";
import { notifyPoUpdate } from "@/lib/production/notifications";
import { getStageLabels } from "@/lib/production/stage-labels";

const bodySchema = z.object({
  stage: z.string().min(1),
  /** Number of days; null clears the per-PO override (revert to global). */
  days: z.number().int().min(0).max(3650).nullable(),
});

/**
 * Set (or clear) a (sub-)PO's per-stage day estimate. The timeline legend's
 * click-to-edit affordance writes to this endpoint; the production timeline
 * uses these days instead of the global cycle-time average for THIS PO's
 * bars. Admin-only — suppliers hit /api/supplier/po/[id]/stage-estimate.
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

  await setPoStageEstimate(id, input.stage, input.days);

  const labels = await getStageLabels();
  const stageDisplay = labels[input.stage] ?? input.stage;
  await notifyPoUpdate({
    poId: id,
    summary:
      input.days != null
        ? `Set ${stageDisplay} estimate to ${input.days} days`
        : `Cleared ${stageDisplay} estimate`,
    actor: {
      role: session.user.role,
      name: session.user.name,
      supplierId: session.user.supplierId,
    },
  });

  return NextResponse.json({ data: { id, stage: input.stage } });
}
