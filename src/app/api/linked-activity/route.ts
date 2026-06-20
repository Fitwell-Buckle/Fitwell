import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntityActivity } from "@/lib/tradeshows/activity";

// Unified cross-entity activity for a booth-met entity, resolvable from any of
// its linked ids (the trade-show vendor, the customer lead, or the supplier
// lead). Returns the linked-record summary + a merged, newest-first timeline.
// Returns 204 (no content) when the id isn't linked to a trade-show vendor, so
// detail pages can cheaply decide whether to render the panel.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const refs = {
    vendorId: url.searchParams.get("vendorId") ?? undefined,
    leadId: url.searchParams.get("leadId") ?? undefined,
    supplierLeadId: url.searchParams.get("supplierLeadId") ?? undefined,
  };
  if (!refs.vendorId && !refs.leadId && !refs.supplierLeadId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const activity = await getEntityActivity(refs);
    if (!activity) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ data: activity });
  } catch (err) {
    console.error("Linked activity failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
