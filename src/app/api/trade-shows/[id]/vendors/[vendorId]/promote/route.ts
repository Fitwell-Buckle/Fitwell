import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { promoteVendor } from "@/lib/tradeshows/service";
import { promoteVendorSchema } from "@/lib/tradeshows/validation";

// Promote a vendor into the requested CRM pipeline (supplier-lead or
// customer-lead), linking the two. Idempotent per side.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; vendorId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { vendorId } = await params;

  let input;
  try {
    input = promoteVendorSchema.parse(await req.json());
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
    const result = await promoteVendor(vendorId, input.target, session.user.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("Promote vendor failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
