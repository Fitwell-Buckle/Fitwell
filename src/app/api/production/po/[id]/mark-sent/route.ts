import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { setPoSent } from "@/lib/production/service";

const bodySchema = z.object({ sent: z.boolean() });

// Manually mark a PO (or sub-PO) as sent / not sent — for POs handed off via
// WhatsApp, phone, or in person (emailing one auto-stamps it). Admin-only.
export async function POST(
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
    columns: { id: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await setPoSent(id, input.sent, "manual");
  return NextResponse.json({ data: { id, sent: input.sent } });
}
