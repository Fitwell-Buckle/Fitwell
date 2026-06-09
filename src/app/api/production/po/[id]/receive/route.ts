import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { receivePo } from "@/lib/production/receive";
import { notifyPoUpdate } from "@/lib/production/notifications";

// Detect the "scope not granted" failure mode so the UI can show a clear hint
// rather than a raw Shopify 403 body.
function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("403") ||
    m.includes("write_inventory") ||
    m.includes("not approved") ||
    m.includes("access denied") ||
    m.includes("requires merchant approval")
  );
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Receiving writes Shopify inventory — admin-only.
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await receivePo(id);
    const scopeBlocked = result.failed.some((f) => isScopeError(f.error));
    // Notify the supplier even if some adjustments failed — the receive action
    // still ran and they should know.
    await notifyPoUpdate({
      poId: id,
      summary: "Marked PO as received",
      actor: {
        role: session.user.role,
        name: session.user.name,
        supplierId: session.user.supplierId,
      },
    });
    return NextResponse.json({
      data: result,
      // Surfaced when adjustments failed because write_inventory isn't granted.
      hint: scopeBlocked
        ? "Shopify rejected the inventory adjustment. Grant the write_inventory scope in the Shopify Dev Dashboard and re-authorize the store, then try again."
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Receive PO failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
