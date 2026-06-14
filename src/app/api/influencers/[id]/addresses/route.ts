import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInfluencerAddresses } from "@/lib/portal/addresses";

// An influencer's saved Shopify addresses (from their linked customer), for the
// gifting order form's ship-to / split-fulfillment picker. Admin-only. Same
// source the detail page uses (self-heals from Shopify if nothing is synced).
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
  return NextResponse.json({ data: await getInfluencerAddresses(id) });
}
