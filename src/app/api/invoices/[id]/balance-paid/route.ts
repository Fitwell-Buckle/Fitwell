import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markBalancePaid } from "@/lib/invoicing/service";

/**
 * Record that the balance / final payment on a B2B invoice has been received.
 * Sets balancePaidAt and — if the deposit is complete or there was none —
 * also auto-flips the invoice's status to "paid" + stamps paidAt. Admin-only.
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
  const result = await markBalancePaid(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    message: result.fullyPaid
      ? "Final payment received — invoice marked paid."
      : "Balance marked paid (waiting on deposit).",
  });
}
