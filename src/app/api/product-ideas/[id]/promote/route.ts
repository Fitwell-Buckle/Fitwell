import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { promoteIdeaToPrototype } from "@/lib/product-ideas/service";

// The gate: promote a product idea into a prototype (creates the prototype,
// marks the idea promoted, links them). Returns the new prototype's id so the
// client can navigate to it. Admin-only.
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
    const result = await promoteIdeaToPrototype(id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      data: {
        prototypeId: result.prototypeId,
        alreadyPromoted: result.alreadyPromoted,
      },
    });
  } catch (err) {
    console.error("Promote product idea failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
