import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dismissLeadReply } from "@/lib/crm/service";

const schema = z.object({ gmailMessageId: z.string().min(1).max(200) });

// Hide one inbound reply from this lead's Replies tab.
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
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  await dismissLeadReply(id, input.gmailMessageId);
  return NextResponse.json({ data: { ok: true } });
}
