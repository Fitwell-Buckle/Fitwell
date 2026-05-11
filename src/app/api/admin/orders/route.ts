import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer, orderLineItem } from "@/lib/schema";
import { desc, eq, and, gte, lte, count, sql, ilike } from "drizzle-orm";
import { paginationSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams);
  const { page, limit } = paginationSchema.parse(searchParams);
  const offset = (page - 1) * limit;

  const status = searchParams.status;
  const from = searchParams.from;
  const to = searchParams.to;
  const product = searchParams.product;

  const conditions = [];

  if (status) {
    conditions.push(eq(order.financialStatus, status));
  }
  if (from) {
    conditions.push(gte(order.processedAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(order.processedAt, new Date(to)));
  }
  if (product) {
    // Subquery: orders that have a matching line item
    const matchingOrderIds = db
      .selectDistinct({ orderId: orderLineItem.orderId })
      .from(orderLineItem)
      .where(
        sql`(${ilike(orderLineItem.sku, `%${product}%`)} OR ${ilike(orderLineItem.title, `%${product}%`)})`,
      );
    conditions.push(sql`${order.id} IN (${matchingOrderIds})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [orders, totalResult] = await Promise.all([
    db
      .select({
        id: order.id,
        shopifyId: order.shopifyId,
        shopifyOrderNumber: order.shopifyOrderNumber,
        customerId: order.customerId,
        totalPrice: order.totalPrice,
        subtotalPrice: order.subtotalPrice,
        currency: order.currency,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        processedAt: order.processedAt,
        createdAt: order.createdAt,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerEmail: customer.email,
      })
      .from(order)
      .leftJoin(customer, eq(order.customerId, customer.id))
      .where(where)
      .orderBy(desc(order.processedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(order).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;

  return NextResponse.json({
    data: orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
