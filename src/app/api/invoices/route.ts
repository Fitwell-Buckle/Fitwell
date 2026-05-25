import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createInvoice, createInvoiceSchema } from "@/lib/invoicing/service";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = createInvoiceSchema.parse(await req.json());
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
    const result = await createInvoice(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("Create invoice failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
