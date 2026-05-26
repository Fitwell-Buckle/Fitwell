import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { setSubPoPrice } from "@/lib/production/service";

const bodySchema = z.object({
  // Dollars from the form; null clears the price.
  price: z.number().nonnegative().nullable(),
});

// Set a sub-PO's supplier price (the only field editable on a sub-PO). Admin-only,
// and only valid for an actual sub-PO (parent_po_id set).
export async function PATCH(
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

  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, id),
    columns: { id: true, parentPoId: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!po.parentPoId) {
    return NextResponse.json(
      { error: "Price is editable on sub-POs only." },
      { status: 409 },
    );
  }

  const cents = input.price == null ? null : Math.round(input.price * 100);
  await setSubPoPrice(id, cents);
  return NextResponse.json({ data: { id, supplierPriceCents: cents } });
}
