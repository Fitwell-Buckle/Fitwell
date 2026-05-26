import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markInvoiceFulfilled } from "@/lib/invoicing/service";

// Mark a B2B order fulfilled. If a deposit was taken, this generates the
// balance Shopify draft order + payment link. Admin-only.
export async function POST(
  _req: Request,
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
  const result = await markInvoiceFulfilled(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    data: { balancePayUrl: result.balancePayUrl },
    message: result.note,
  });
}
