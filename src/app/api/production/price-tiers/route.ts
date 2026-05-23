import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { priceTier } from "@/lib/schema";

export const priceTierSchema = z.object({
  name: z.string().min(1).max(200),
  discountPercent: z.number().min(0).max(100),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const [created] = await db
      .insert(priceTier)
      .values({ name: input.name, discountPercent: input.discountPercent })
      .returning({ id: priceTier.id });
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create price tier failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
