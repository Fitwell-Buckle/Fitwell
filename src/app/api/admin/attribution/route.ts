import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { calculateAttribution } from "@/lib/analytics/attribution";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const attribution = await calculateAttribution();

  return NextResponse.json({ data: attribution, success: true });
}
