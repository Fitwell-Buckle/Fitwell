import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCustomerById } from "@/lib/admin/customers";
import { calculateCustomerLTV } from "@/lib/analytics/ltv";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ltv = await calculateCustomerLTV(id);

  return NextResponse.json({
    customer,
    orders: customer.orders ?? [],
    ltv,
  });
}
