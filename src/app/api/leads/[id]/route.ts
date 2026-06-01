import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dropLead, getLead, updateLead, updateLeadSchema } from "@/lib/crm/service";

function adminOnly(role?: string | null): NextResponse | null {
  if (role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { id } = await params;
  const row = await getLead(id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row });
}

export async function PATCH(
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

  let input;
  try {
    input = updateLeadSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const updated = await updateLead(id, input);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update lead failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Soft delete (status → 'dropped'). History preserved per work plan v1
// scope; hard delete is intentionally not exposed.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { id } = await params;

  try {
    const dropped = await dropLead(id);
    if (!dropped) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: dropped.id } });
  } catch (err) {
    console.error("Drop lead failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
