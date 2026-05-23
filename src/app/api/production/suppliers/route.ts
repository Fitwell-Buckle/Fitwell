import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";

export const supplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email().max(200).nullish().or(z.literal("")),
  notes: z.string().max(5000).nullish(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input;
  try {
    input = supplierSchema.parse(await req.json());
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
      .insert(supplier)
      .values({
        name: input.name,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        notes: input.notes || null,
      })
      .returning({ id: supplier.id });
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create supplier failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
