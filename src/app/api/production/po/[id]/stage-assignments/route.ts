import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getStageAssignments, setStageAssignments } from "@/lib/production/service";
import { STAGES, type ProductionStage } from "@/lib/production/stages";

const bodySchema = z.object({
  assignments: z
    .array(z.object({ stage: z.string(), supplierId: z.string() }))
    .max(20),
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
  const valid = input.assignments
    .filter((a) => a.supplierId && STAGES.includes(a.stage as ProductionStage))
    .map((a) => ({ stage: a.stage as ProductionStage, supplierId: a.supplierId }));
  await setStageAssignments(id, valid);
  return NextResponse.json({ data: { count: valid.length } });
}
