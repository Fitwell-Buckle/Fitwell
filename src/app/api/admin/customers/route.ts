import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCustomers } from "@/lib/admin/customers";
import { paginationSchema, customerFiltersSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams);
  const pagination = paginationSchema.parse(searchParams);
  const filters = customerFiltersSchema.parse(searchParams);

  const result = await getCustomers(pagination, filters);

  return NextResponse.json({ ...result, success: true });
}
