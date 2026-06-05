import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { setSubPoEta } from "@/lib/production/service";

const bodySchema = z.object({
  expectedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

// Set a sub-PO's own ETA (expected delivery date). Each supplier sets their own
// ETA on their sub-PO; the master's is locked/derived when the PO is split.
// Admin-only, sub-PO only — mirrors the line-costs route.
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
    columns: { id: true, parentPoId: true },
  });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sub.parentPoId) {
    return NextResponse.json(
      { error: "ETA is set per sub-PO on a multi-supplier PO." },
      { status: 409 },
    );
  }

  await setSubPoEta(id, input.expectedDeliveryDate);
  return NextResponse.json({ data: { id } });
}
