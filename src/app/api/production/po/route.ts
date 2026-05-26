import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createPo,
  createMultiSupplierPo,
  createPoSchema,
} from "@/lib/production/service";
import type { ProductionStage } from "@/lib/production/stages";

// Create body = a normal PO, plus an optional multi-supplier split: when
// `multiSupplier` is set, the stage→supplier assignments generate a master +
// one sub-PO per supplier.
const createPoBodySchema = createPoSchema.extend({
  multiSupplier: z.boolean().optional(),
  stageAssignments: z
    .array(z.object({ stage: z.string().min(1), supplierId: z.string().min(1) }))
    .optional(),
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
      return NextResponse.json(
        { data: { id: result.poId, subPos: result.subPos } },
        { status: 201 },
      );
    }
    const { poId } = await createPo(input);
    return NextResponse.json({ data: { id: poId } }, { status: 201 });
  } catch (err) {
    console.error("Create production PO failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
