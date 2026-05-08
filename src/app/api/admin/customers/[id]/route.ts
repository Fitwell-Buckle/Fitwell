import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCustomerById } from "@/lib/admin/customers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    return NextResponse.json({ error: "Not found", success: false }, { status: 404 });
  }

  return NextResponse.json({ data: customer, success: true });
}
