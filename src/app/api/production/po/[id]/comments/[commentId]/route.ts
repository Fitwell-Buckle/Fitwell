import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { updateComment, commentSchema } from "@/lib/production/service";
import { ensureSupplierMayActOnPo } from "@/lib/production/scope";

/**
 * Edit a note (production_comment) on a PO. Author-only: you can change just
 * the notes you wrote, on either surface (admin dashboard or supplier portal).
 * PO-level scope is also checked so a supplier can only touch their own POs.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, commentId } = await params;

  // Suppliers may only act on their own PO; admins pass. (Author-only edit is
  // enforced below in addition to this.)
  const denied = await ensureSupplierMayActOnPo(session, id);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  let input;
  try {
    input = commentSchema.parse(await req.json());
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
    // Returns null unless this user authored the note — the WHERE clause is
    // the real boundary, so there's no separate ownership read to race.
    const updated = await updateComment({
      commentId,
      authorUserId: session.user.id,
      body: input.body,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "You can only edit your own notes." },
        { status: 403 },
      );
    }
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("Edit PO comment failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
