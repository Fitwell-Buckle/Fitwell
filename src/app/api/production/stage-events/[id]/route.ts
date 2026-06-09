import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPoLineItem, productionStageEvent } from "@/lib/schema";
import { updateStageEventDate } from "@/lib/production/service";
import { notifyPoUpdate } from "@/lib/production/notifications";

const schema = z.object({
  enteredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});

// Edit a stage transition date. Admin-only; suppliers advance stages but don't
// rewrite history. The service syncs the previous event's exited_at so the
// Gantt and cycle-time stay consistent.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await updateStageEventDate(id, input.enteredDate);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // Walk event → line item → PO to notify the supplier whose timeline changed.
  const event = await db.query.productionStageEvent.findFirst({
    where: eq(productionStageEvent.id, id),
    columns: { lineItemId: true, stage: true },
  });
  if (event) {
    const li = await db.query.productionPoLineItem.findFirst({
      where: eq(productionPoLineItem.id, event.lineItemId),
      columns: { poId: true, sku: true },
    });
    if (li) {
      await notifyPoUpdate({
        poId: li.poId,
        summary: `Edited a stage timestamp on ${li.sku} (${event.stage} → ${input.enteredDate})`,
        actor: {
          role: session.user.role,
          name: session.user.name,
          supplierId: session.user.supplierId,
        },
      });
    }
  }
  return NextResponse.json({ data: { id, enteredAt: result.enteredAt } });
}
