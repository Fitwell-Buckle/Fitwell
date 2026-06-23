import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { addRound } from "@/lib/prototypes/service";
import { roundSchema } from "../../_schema";

export async function POST(
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
    input = roundSchema.parse(await req.json());
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
    const created = await addRound(id, input);
    return NextResponse.json(
      { data: { id: created.id, roundNumber: created.roundNumber } },
      { status: 201 },
    );
  } catch (err) {
    console.error("Add prototype round failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
