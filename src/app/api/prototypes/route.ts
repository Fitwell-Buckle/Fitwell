import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createPrototype } from "@/lib/prototypes/service";
import { prototypeSchema } from "./_schema";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = prototypeSchema.parse(await req.json());
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
    const created = await createPrototype(input);
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create prototype failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
