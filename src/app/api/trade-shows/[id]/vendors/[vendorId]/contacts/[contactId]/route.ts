import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  deleteVendorContact,
  updateVendorContact,
} from "@/lib/tradeshows/service";
import { updateVendorContactSchema } from "@/lib/tradeshows/validation";

function adminOnly(role?: string | null): NextResponse | null {
  if (role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; vendorId: string; contactId: string }>;
  },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { contactId } = await params;

  let input;
  try {
    input = updateVendorContactSchema.parse(await req.json());
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
    const updated = await updateVendorContact(contactId, input);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update vendor contact failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; vendorId: string; contactId: string }>;
  },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  const { contactId } = await params;

  try {
    const result = await deleteVendorContact(contactId);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: result.id } });
  } catch (err) {
    console.error("Delete vendor contact failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
