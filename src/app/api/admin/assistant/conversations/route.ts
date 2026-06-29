import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/ai/assistant/persistence";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversations = await listConversations(session.user.id);
  return NextResponse.json({ data: conversations });
}
