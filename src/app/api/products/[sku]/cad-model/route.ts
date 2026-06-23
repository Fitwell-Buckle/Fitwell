import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { linkCadModel } from "@/lib/cad/products";

const bodySchema = z.object({ cadModelId: z.string().min(1).nullable() });

// Link (or unlink, with null) a SKU to a saved CAD model.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sku: encoded } = await params;
  const sku = decodeURIComponent(encoded);

  let input;
  try {
    input = bodySchema.parse(await req.json());
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
    await linkCadModel(sku, input.cadModelId);
    return NextResponse.json({ data: { sku } });
  } catch (err) {
    console.error("Link CAD model failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
