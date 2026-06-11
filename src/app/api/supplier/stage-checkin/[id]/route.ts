import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionStageCheckin } from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";

const bodySchema = z.object({
  status: z.enum(["on_track", "at_risk"]),
  note: z.string().max(500).optional(),
});

/**
 * Supplier answers a stage check-in (positive control). Confirms on-track or
 * flags a delay for the whole stage instance — every still-pending threshold
 * row for that (PO, supplier, stage, entry) is resolved at once. Scoped to the
 * signed-in supplier's own check-ins.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getSupplierScope();
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const row = await db.query.productionStageCheckin.findFirst({
    where: eq(productionStageCheckin.id, id),
  });
  if (!row || row.supplierId !== scope.supplierId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve every still-pending threshold for this stage instance together.
  await db
    .update(productionStageCheckin)
    .set({
      status: input.status,
      note: input.note ?? null,
      respondedAt: new Date(),
    })
    .where(
      and(
        eq(productionStageCheckin.poId, row.poId),
        eq(productionStageCheckin.supplierId, row.supplierId),
        eq(productionStageCheckin.stage, row.stage),
        eq(productionStageCheckin.stageEnteredAt, row.stageEnteredAt),
        eq(productionStageCheckin.status, "pending"),
      ),
    );

  return NextResponse.json({ data: { ok: true, status: input.status } });
}
