import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getTradeShow,
  listVendors,
  type ListVendorsFilters,
} from "@/lib/tradeshows/service";

function adminOnly(role?: string | null): NextResponse | null {
  if (role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function boolParam(v: string | null): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

// Returns the show plus its (filtered) vendor list in one call.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { id } = await params;
  const show = await getTradeShow(id);
  if (!show) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const filters: ListVendorsFilters = {
    side: url.searchParams.get("side") ?? undefined,
    visited: boolParam(url.searchParams.get("visited")),
    priority: boolParam(url.searchParams.get("priority")),
    followUpStatus: url.searchParams.get("followUpStatus") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  };

  try {
    const vendors = await listVendors(id, filters);
    return NextResponse.json({ data: { show, vendors } });
  } catch (err) {
    console.error("Get trade show failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
