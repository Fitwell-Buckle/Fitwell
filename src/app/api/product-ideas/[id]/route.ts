import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deleteIdea, updateIdea } from "@/lib/product-ideas/service";
import { ideaSchema } from "../_schema";
import { resolveIdeaFusion } from "../_fusion";

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
    input = ideaSchema.partial().parse(await req.json());
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

  const fusion = await resolveIdeaFusion(input.fusionUrl);
  if (!fusion.ok) {
    return NextResponse.json({ error: fusion.error }, { status: 400 });
  }
  const { fusionUrl: _raw, ...rest } = input;

  try {
    const updated = await updateIdea(id, { ...rest, ...fusion.fields });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update product idea failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
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
    const deleted = await deleteIdea(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: deleted.id } });
  } catch (err) {
    console.error("Delete product idea failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
