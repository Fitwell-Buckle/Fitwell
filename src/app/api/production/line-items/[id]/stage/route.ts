import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPoLineItem } from "@/lib/schema";
import { setStage, notifySupplierHandoff } from "@/lib/production/service";
import { type ProductionStage } from "@/lib/production/stages";
import { getStageOrder } from "@/lib/production/stage-labels";
import { ensureSupplierMayActOnLineItem } from "@/lib/production/scope";
import { notifyPoUpdate } from "@/lib/production/notifications";

const bodySchema = z.object({ stage: z.string() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Suppliers may move only line items on their own PO; admins pass.
  const denied = await ensureSupplierMayActOnLineItem(session, id);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

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

  const order = await getStageOrder();
  if (!order.includes(input.stage)) {
    return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
  }

  try {
    const transitions = await setStage({
      lineItemId: id,
      toStage: input.stage as ProductionStage,
      userId: session.user.id,
    });
    // If a supplier just handed a line off (moved it out of their stages),
    // notify the admins (in-app + email).
    if (session.user.role === "supplier" && session.user.supplierId) {
      await notifySupplierHandoff({
        lineItemId: id,
        supplierId: session.user.supplierId,
        transitions,
      });
    }
    // Generic per-write update to the other party. Lives alongside the more
    // specific handoff alert so the recipient still sees every stage move.
    const li = await db.query.productionPoLineItem.findFirst({
      where: eq(productionPoLineItem.id, id),
      columns: { poId: true, sku: true },
    });
    if (li) {
      await notifyPoUpdate({
        poId: li.poId,
        summary: `Moved line item ${li.sku} to ${input.stage}`,
        actor: {
          role: session.user.role,
          name: session.user.name,
          supplierId: session.user.supplierId,
        },
      });
    }
    return NextResponse.json({ data: { transitions } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Set line-item stage failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
