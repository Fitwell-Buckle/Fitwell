import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompanyAddresses } from "@/lib/portal/addresses";

// A company's saved Shopify addresses, for the admin invoice form's ship-to /
// split-fulfillment picker. Admin-only. Same source the portal uses (self-heals
// from Shopify if nothing is synced yet).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  return NextResponse.json({ data: await getCompanyAddresses(id) });
}
