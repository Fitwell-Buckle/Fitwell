import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice } from "@/lib/schema";
import {
  createPo,
  createMultiSupplierPo,
  createPoSchema,
} from "@/lib/production/service";
import type { ProductionStage } from "@/lib/production/stages";

// Create body = a normal PO, plus an optional multi-supplier split: when
// `multiSupplier` is set, the stage→supplier assignments generate a master +
// one sub-PO per supplier. `invoiceId`, when present, links the new PO back to
// that invoice (sets invoice.source_po_id) — used by the invoice page's PoForm.
const createPoBodySchema = createPoSchema.extend({
  multiSupplier: z.boolean().optional(),
  stageAssignments: z
    .array(z.object({ stage: z.string().min(1), supplierId: z.string().min(1) }))
    .optional(),
  invoiceId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input;
  try {
    input = createPoBodySchema.parse(await req.json());
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
    if (input.multiSupplier && input.stageAssignments?.length) {
      const result = await createMultiSupplierPo(
        input,
        input.stageAssignments as { stage: ProductionStage; supplierId: string }[],
      );
      if (input.invoiceId) await linkInvoiceToPo(input.invoiceId, result.poId);
      return NextResponse.json(
        { data: { id: result.poId, subPos: result.subPos } },
        { status: 201 },
      );
    }
    const { poId } = await createPo(input);
    if (input.invoiceId) await linkInvoiceToPo(input.invoiceId, poId);
    return NextResponse.json({ data: { id: poId } }, { status: 201 });
  } catch (err) {
    console.error("Create production PO failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function linkInvoiceToPo(invoiceId: string, poId: string): Promise<void> {
  await db
    .update(invoice)
    .set({ sourcePoId: poId, updatedAt: new Date() })
    .where(eq(invoice.id, invoiceId));
}
