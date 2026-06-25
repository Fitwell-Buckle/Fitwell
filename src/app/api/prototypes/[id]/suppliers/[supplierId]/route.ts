import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { recordPrototypeQuote } from "@/lib/prototypes/service";

const quoteSchema = z.object({
  unitCostCents: z.number().int().min(0).nullish(),
  leadTimeDays: z.number().int().min(0).max(3650).nullish(),
  moq: z.number().int().min(0).nullish(),
  setupCostCents: z.number().int().min(0).nullish(),
  notes: z.string().max(5000).nullish(),
});

// Record (or update) the quote a vendor gave for a prototype — works whether or
// not the RFQ was sent through the system. Admin-only.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, supplierId } = await params;

  let input;
  try {
    input = quoteSchema.parse(await req.json());
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
    const updated = await recordPrototypeQuote(id, supplierId, input);
    if (!updated) {
      return NextResponse.json(
        { error: "That vendor isn’t a candidate on this prototype." },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Record prototype quote failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
