import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createPo, createPoSchema } from "@/lib/production/service";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input;
  try {
    input = createPoSchema.parse(await req.json());
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
    const { poId } = await createPo(input);
    return NextResponse.json({ data: { id: poId } }, { status: 201 });
  } catch (err) {
    console.error("Create production PO failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
