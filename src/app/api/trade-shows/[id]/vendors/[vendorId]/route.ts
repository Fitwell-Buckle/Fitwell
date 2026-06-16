import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  deleteVendor,
  getVendor,
  updateVendor,
} from "@/lib/tradeshows/service";
import { updateVendorSchema } from "@/lib/tradeshows/validation";

function adminOnly(role?: string | null): NextResponse | null {
  if (role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; vendorId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { vendorId } = await params;
  const row = await getVendor(vendorId);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; vendorId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { vendorId } = await params;

  let input;
  try {
    input = updateVendorSchema.parse(await req.json());
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
    const updated = await updateVendor(vendorId, input, session.user.id);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update vendor failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Hard-delete a vendor (not a lead in either direction). Removes the worklist
// row + its voice notes; any already-promoted lead/supplier-lead is untouched.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; vendorId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { vendorId } = await params;

  try {
    const result = await deleteVendor(vendorId);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: result.id } });
  } catch (err) {
    console.error("Delete vendor failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
