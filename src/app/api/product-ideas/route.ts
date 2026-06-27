import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createIdea } from "@/lib/product-ideas/service";
import { ideaSchema } from "./_schema";
import { resolveIdeaFusion } from "./_fusion";

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
    input = ideaSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const fusion = await resolveIdeaFusion(input.fusionUrl);
  if (!fusion.ok) {
    return NextResponse.json({ error: fusion.error }, { status: 400 });
  }
  const { fusionUrl: _raw, ...rest } = input;

  try {
    const created = await createIdea({ ...rest, ...fusion.fields });
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    console.error("Create product idea failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
