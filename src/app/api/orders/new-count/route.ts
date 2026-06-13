import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countNewB2bOrders } from "@/lib/invoicing/order-notifications";

// Unread new-B2B-order count for the "Orders" nav blue dot. Admin-only.
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ count: await countNewB2bOrders() });
}
