import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markDepositPaid } from "@/lib/invoicing/service";

/**
 * Record that the deposit on a B2B invoice has been received. Sets
 * depositPaidAt; the overall invoice status stays "sent" until the balance
 * is also paid. Admin-only.
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
  const result = await markDepositPaid(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ message: "Deposit marked paid." });
}
