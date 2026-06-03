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
    // Surface the first validation message (e.g. the missing-SKU one) instead
    // of a generic "Invalid payload" so the form tells the user what to fix.
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? (err.issues[0]?.message ?? "Invalid payload")
            : "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const result = await createInvoice(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("already exists for this PO")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("Create invoice failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
