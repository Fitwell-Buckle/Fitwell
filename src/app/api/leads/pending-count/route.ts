import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countDraftMessages } from "@/lib/crm/messages";

// Count of queued (draft) follow-up messages — drives the blue dot on the
// Customer group + Leads nav items.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ count: 0 });
  }
  try {
    return NextResponse.json({ count: await countDraftMessages() });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
