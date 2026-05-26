import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionPoLineItem } from "@/lib/schema";
import { setSupplierLineCosts } from "@/lib/production/service";

const bodySchema = z.object({
  costs: z
    .array(
      z.object({
        lineItemId: z.string().min(1),
        unitCostCents: z.number().int().nonnegative().nullable(),
      }),
    )
    .max(500),
});

// Set a sub-PO supplier's per-line unit costs. Costs roll up onto the master, so
// they're keyed there by (master, supplier, line). Admin-only — this is what we
// pay the supplier, not something the supplier edits.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const sub = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, id),
    columns: { id: true, parentPoId: true, supplierId: true },
  });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sub.parentPoId) {
    return NextResponse.json(
      { error: "Costs are editable on sub-POs only." },
      { status: 409 },
    );
  }

  // Only accept line items that actually belong to the master (FK guards
  // existence; this guards ownership).
  const masterLines = await db
    .select({ id: productionPoLineItem.id })
    .from(productionPoLineItem)
    .where(eq(productionPoLineItem.poId, sub.parentPoId));
  const valid = new Set(masterLines.map((l) => l.id));
  const costs = input.costs.filter((c) => valid.has(c.lineItemId));

  await setSupplierLineCosts(sub.parentPoId, sub.supplierId, costs);
  return NextResponse.json({ data: { count: costs.length } });
}
