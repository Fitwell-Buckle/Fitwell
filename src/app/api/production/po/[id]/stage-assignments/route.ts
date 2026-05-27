import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getStageAssignments,
  setStageAssignments,
  syncMasterSubPos,
} from "@/lib/production/service";
import { type ProductionStage } from "@/lib/production/stages";
import { getStageOrder } from "@/lib/production/stage-labels";

const bodySchema = z.object({
  assignments: z
    .array(z.object({ stage: z.string(), supplierId: z.string() }))
    .max(20),
  // When set, regenerate this PO's sub-POs to match the assignments (master);
  // false/absent removes any sub-POs (standalone PO with stage owners only).
  multiSupplier: z.boolean().optional(),
});

function denyNonAdmin(role: string | undefined) {
  return role === "supplier" || role === "company";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || denyNonAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  return NextResponse.json({ data: await getStageAssignments(id) });
}

// Admin-only: replace the PO's stage→supplier assignments.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || denyNonAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const order = await getStageOrder();
  const valid = input.assignments
    .filter((a) => a.supplierId && order.includes(a.stage))
    .map((a) => ({ stage: a.stage as ProductionStage, supplierId: a.supplierId }));
  await setStageAssignments(id, valid);
  await syncMasterSubPos(id, input.multiSupplier ?? false);
  return NextResponse.json({ data: { count: valid.length } });
}
