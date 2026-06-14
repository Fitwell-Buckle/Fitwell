import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createSupplierLead,
  createSupplierLeadSchema,
  listSupplierLeads,
  type ListSupplierLeadsFilters,
} from "@/lib/suppliers/lead-service";

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
  const filters: ListSupplierLeadsFilters = {
    status: url.searchParams.get("status") ?? undefined,
    supplierType: url.searchParams.get("supplierType") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  };

  try {
    const rows = await listSupplierLeads(filters);
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("List supplier leads failed:", err);
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
    input = createSupplierLeadSchema.parse(await req.json());
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
    const result = await createSupplierLead(input, {
      capturedByUserId: session.user.id,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("Create supplier lead failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
