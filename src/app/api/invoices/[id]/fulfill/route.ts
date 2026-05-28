import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markInvoiceFulfilled } from "@/lib/invoicing/service";

/**
 * Mark a B2B invoice fulfilled. When a deposit was taken, this also creates a
 * Shopify draft order for the remaining balance and returns its payment link.
 * Service degrades gracefully if the Shopify scope is missing — still stamps
 * the invoice fulfilled, just skips the balance draft. Admin-only.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
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
