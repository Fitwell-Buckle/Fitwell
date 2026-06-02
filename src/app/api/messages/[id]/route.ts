import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { updateMessageSchema, updateOutboundMessage } from "@/lib/crm/messages";

// Edit a queued message (subject/body/recipient) or change its status
// (mark sent / dismissed). Admin-only.
export async function PATCH(
  req: Request,
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

  let input;
  try {
    input = updateMessageSchema.parse(await req.json());
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
    const updated = await updateOutboundMessage(id, input, session.user.id);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update message failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
