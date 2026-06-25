import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  addPrototypeSupplier,
  removePrototypeSupplier,
} from "@/lib/prototypes/service";

const bodySchema = z.object({ supplierId: z.string().min(1).max(100) });

// Manage a prototype's candidate vendor set (the RFQ recipients). POST attaches
// a vendor, DELETE detaches it (clearing the award if it pointed at that vendor).
// Admin-only — suppliers/companies can't edit prototypes.
async function guard() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

async function parse(req: Request) {
  return bodySchema.parse(await req.json());
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  let body;
  try {
    body = await parse(req);
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
    await addPrototypeSupplier(id, body.supplierId);
    return NextResponse.json({ data: { id, supplierId: body.supplierId } }, {
      status: 201,
    });
  } catch (err) {
    console.error("Add prototype vendor failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  let body;
  try {
    body = await parse(req);
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
    await removePrototypeSupplier(id, body.supplierId);
    return NextResponse.json({ data: { id, supplierId: body.supplierId } });
  } catch (err) {
    console.error("Remove prototype vendor failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
