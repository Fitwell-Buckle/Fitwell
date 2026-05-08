import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order } from "@/lib/schema";
import { desc, count } from "drizzle-orm";
import { paginationSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams);
  const { page, limit } = paginationSchema.parse(searchParams);
  const offset = (page - 1) * limit;

  const [orders, totalResult] = await Promise.all([
    db
      .select()
      .from(order)
      .orderBy(desc(order.processedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(order),
  ]);

  const total = totalResult[0]?.count ?? 0;

  return NextResponse.json({
    data: orders,
    success: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
