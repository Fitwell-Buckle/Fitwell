import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { priceTier } from "@/lib/schema";
import { priceTierSchema } from "../route";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let input;
  try {
    input = priceTierSchema.parse(await req.json());
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
    const [updated] = await db
      .update(priceTier)
      .set({
        name: input.name,
        discountPercent: input.discountPercent,
        updatedAt: new Date(),
      })
      .where(eq(priceTier.id, id))
      .returning({ id: priceTier.id });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update price tier failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
