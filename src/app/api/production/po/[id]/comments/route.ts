import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addComment, commentSchema } from "@/lib/production/service";
import { ensureSupplierMayActOnPo } from "@/lib/production/scope";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Suppliers may comment only on their own PO; admins pass.
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
    const comment = await addComment({
      poId: id,
      authorUserId: session.user.id,
      body: input.body,
    });
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (err) {
    console.error("Add PO comment failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
