import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createLead,
  createLeadSchema,
  listLeads,
  type ListLeadsFilters,
} from "@/lib/crm/service";

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
  const filters: ListLeadsFilters = {
    stage: url.searchParams.get("stage") ?? undefined,
    sourceChannel: url.searchParams.get("sourceChannel") ?? undefined,
    tradeshowId: url.searchParams.get("tradeshowId") ?? undefined,
    ownerUserId: url.searchParams.get("ownerUserId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  };

  try {
    const rows = await listLeads(filters);
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("List leads failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  let input;
  try {
    input = createLeadSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const result = await createLead(input, {
      capturedByUserId: session.user.id,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("Create lead failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
