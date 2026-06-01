import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createTradeshow,
  listTradeshows,
  tradeshowSchema,
} from "@/lib/crm/service";

function adminOnly(role?: string | null): NextResponse | null {
  if (role === "supplier" || role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  try {
    const rows = await listTradeshows();
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("List tradeshows failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = adminOnly(session.user.role);
  if (denied) return denied;

  let input;
  try {
    input = tradeshowSchema.parse(await req.json());
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
    const result = await createTradeshow(input);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("Create tradeshow failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
