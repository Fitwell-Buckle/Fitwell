import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSupplierTypeOptions } from "@/lib/suppliers/lead-service";

// Options for the supplier-persona multi-select: built-in presets plus every
// distinct persona ever saved (so "Other" entries persist for next time).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const options = await listSupplierTypeOptions();
    return NextResponse.json({ data: options });
  } catch (err) {
    console.error("List supplier type options failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
