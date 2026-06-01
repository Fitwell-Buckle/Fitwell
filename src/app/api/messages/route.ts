import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listOutboundMessages } from "@/lib/crm/messages";

// List queued outbound messages. Defaults to the pending (draft) queue;
// pass ?status=sent|dismissed to view the others.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  try {
    const rows = await listOutboundMessages({ status });
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("List messages failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
