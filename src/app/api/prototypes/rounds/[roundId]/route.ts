import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteRound, updateRound } from "@/lib/prototypes/service";
import { roundSchema } from "../../_schema";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roundId } = await params;

  let input;
  try {
    input = roundSchema.partial().parse(await req.json());
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
    const updated = await updateRound(roundId, input);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update prototype round failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roundId } = await params;
  try {
    const deleted = await deleteRound(roundId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: deleted.id } });
  } catch (err) {
    console.error("Delete prototype round failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
