import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listTradeShows } from "@/lib/tradeshows/service";

function adminOnly(role?: string | null): NextResponse | null {
  if (role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "active";

  try {
    const rows = await listTradeShows(status);
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("List trade shows failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
