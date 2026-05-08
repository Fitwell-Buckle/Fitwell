import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { campaign } from "@/lib/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const campaigns = await db
    .select()
    .from(campaign)
    .orderBy(desc(campaign.createdAt));

  return NextResponse.json({ data: campaigns, success: true });
}
