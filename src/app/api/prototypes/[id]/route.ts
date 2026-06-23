import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { approvePrototype } from "@/lib/prototypes";
import {
  deletePrototype,
  getPrototypeRow,
  updatePrototype,
} from "@/lib/prototypes/service";
import { prototypeSchema } from "../_schema";

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
    input = prototypeSchema.partial().parse(await req.json());
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
    // Approving requires a final SKU — accept it in this PATCH or fall back to
    // one already recorded on the row. This is the "promote to product" gate.
    let extra: { finalSku?: string; approvedAt?: Date } = {};
    if (input.status === "approved") {
      const existing = await getPrototypeRow(id);
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const result = approvePrototype(
        { status: "approved", finalSku: input.finalSku ?? existing.finalSku },
        new Date(),
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      extra = { finalSku: result.fields!.finalSku, approvedAt: result.fields!.approvedAt };
    }

    const updated = await updatePrototype(id, input, extra);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update prototype failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Delete a prototype. Rounds and attachments cascade (FK onDelete cascade),
// and the supplier link is nullable so no unlinking is needed.
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
    const deleted = await deletePrototype(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: deleted.id } });
  } catch (err) {
    console.error("Delete prototype failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
