import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { promoteToSupplier } from "@/lib/suppliers/lead-service";

// Promote a captured supplier lead into a real `supplier` row, mark the lead
// converted, and link the two. Returns the new (or already-linked) supplier id.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await promoteToSupplier(id);
    if (!result) {
      return NextResponse.json(
        { error: "Supplier lead not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("Promote supplier lead failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
