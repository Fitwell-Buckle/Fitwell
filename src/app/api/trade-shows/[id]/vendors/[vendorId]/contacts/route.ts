import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addVendorContact, listVendorContacts } from "@/lib/tradeshows/service";
import { createVendorContactSchema } from "@/lib/tradeshows/validation";

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
  const rows = await listVendorContacts(vendorId);
  return NextResponse.json({ data: rows });
}

export async function POST(
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
    input = createVendorContactSchema.parse(await req.json());
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
    const created = await addVendorContact(vendorId, input, session.user.id);
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Add vendor contact failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
