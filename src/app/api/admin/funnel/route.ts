import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFunnelData } from "@/lib/admin/funnel";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const funnel = await getFunnelData();

  return NextResponse.json({ data: funnel, success: true });
}
