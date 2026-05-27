import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setSubPoStage } from "@/lib/production/service";
import { ensureSupplierMayActOnPo } from "@/lib/production/scope";
import { type ProductionStage } from "@/lib/production/stages";

const bodySchema = z.object({ toStage: z.string() });

// Set a sub-PO's stage directly (drives the master's line items in this
// supplier's stages to the chosen stage — forward, back, or handoff). Auto-save
// target for the stage dropdown. Admins pass; a supplier may act on its own sub-PO.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const denied = await ensureSupplierMayActOnPo(session, id);
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

  // setSubPoStage validates toStage against the sub-PO's available targets.
  try {
    const transitions = await setSubPoStage({
      subPoId: id,
      toStage: input.toStage as ProductionStage,
      userId: session.user.id,
    });
    return NextResponse.json({ data: { transitions } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const isClientError =
      message.includes("not a sub-PO") || message.includes("not available");
    if (isClientError) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("Set sub-PO stage failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
