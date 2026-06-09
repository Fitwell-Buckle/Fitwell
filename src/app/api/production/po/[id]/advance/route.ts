import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { advance, advanceSchema } from "@/lib/production/service";
import { ensureSupplierMayActOnPo } from "@/lib/production/scope";
import { notifyPoUpdate } from "@/lib/production/notifications";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Suppliers may advance only their own PO; admins pass.
  const denied = await ensureSupplierMayActOnPo(session, id);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  // Body is optional; a locked PO advances without a lineItemId.
  let input: z.infer<typeof advanceSchema> = {};
  try {
    const text = await req.text();
    if (text) input = advanceSchema.parse(JSON.parse(text));
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const transitions = await advance({
      poId: id,
      lineItemId: input.lineItemId,
      userId: session.user.id,
    });
    if (transitions.length === 0) {
      return NextResponse.json(
        { error: "Nothing to advance — affected line items are already complete" },
        { status: 409 },
      );
    }
    // Summarise the move for the cross-party notification. Most transitions
    // share a single `to` stage; if they don't, fall back to a count.
    const toStages = [...new Set(transitions.map((t) => t.to))];
    const summary =
      toStages.length === 1
        ? `Advanced ${transitions.length} line item(s) to ${toStages[0]}`
        : `Advanced ${transitions.length} line item(s)`;
    await notifyPoUpdate({
      poId: id,
      summary,
      actor: {
        role: session.user.role,
        name: session.user.name,
        supplierId: session.user.supplierId,
      },
    });
    return NextResponse.json({ data: { transitions } });
  } catch (err) {
    // planAdvance throws for caller errors (missing/unknown target on a broken PO).
    const message = err instanceof Error ? err.message : "Internal error";
    const isClientError =
      message.includes("lineItemId is required") || message.includes("not found");
    if (isClientError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Advance production PO failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
