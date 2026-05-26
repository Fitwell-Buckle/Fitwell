import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createPoFromInvoice,
  createMultiSupplierPoFromInvoice,
} from "@/lib/invoicing/service";
import type { ProductionStage } from "@/lib/production/stages";

const schema = z.object({
  supplierId: z.string().min(1),
  multiSupplier: z.boolean().optional(),
  stageAssignments: z
    .array(z.object({ stage: z.string().min(1), supplierId: z.string().min(1) }))
    .optional(),
});

// Create a draft production PO from an invoice (fulfillment). Admin-only.
export async function POST(
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

  const { id } = await params;
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

  try {
    const result =
      input.multiSupplier && input.stageAssignments?.length
        ? await createMultiSupplierPoFromInvoice(
            id,
            input.supplierId,
            input.stageAssignments as { stage: ProductionStage; supplierId: string }[],
          )
        : await createPoFromInvoice(id, input.supplierId);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Create PO from invoice failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
