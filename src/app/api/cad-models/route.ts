import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createCadModel } from "@/lib/cad/service";
import { cadModelSchema } from "./_schema";

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
    input = cadModelSchema.parse(await req.json());
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
    const created = await createCadModel({
      name: input.name,
      fusionUrl: input.fusionUrl || null,
    });
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create CAD model failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
