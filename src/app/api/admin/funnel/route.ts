import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer } from "@/lib/schema";
import { sql, eq, gte, desc, count, sum } from "drizzle-orm";
import { STORE_TZ } from "@/lib/timezone";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [revenueResult, orderCountResult, customerCountResult, recentOrders, revenueByDay] =
    await Promise.all([
      // Total revenue from paid orders
      db
        .select({ total: sum(order.totalPrice) })
        .from(order)
        .where(eq(order.financialStatus, "paid")),

      // Total orders
      db.select({ count: count() }).from(order),

      // Total customers
      db.select({ count: count() }).from(customer),

      // Recent 10 orders with customer name
      db
        .select({
          id: order.id,
          shopifyOrderNumber: order.shopifyOrderNumber,
          totalPrice: order.totalPrice,
          currency: order.currency,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          processedAt: order.processedAt,
          customerFirstName: customer.firstName,
          customerLastName: customer.lastName,
        })
        .from(order)
        .leftJoin(customer, eq(order.customerId, customer.id))
        .orderBy(desc(order.processedAt))
        .limit(10),

      // Revenue by day for last 30 days
      db
        .select({
          date: sql<string>`date_trunc('day', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date::text`,
          revenue: sum(order.totalPrice),
          orders: count(),
        })
        .from(order)
        .where(gte(order.processedAt, thirtyDaysAgo))
        .groupBy(sql`date_trunc('day', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`)
        .orderBy(sql`date_trunc('day', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`),
    ]);

  const totalRevenue = Number(revenueResult[0]?.total ?? 0);
  const totalOrders = orderCountResult[0]?.count ?? 0;
  const totalCustomers = customerCountResult[0]?.count ?? 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return NextResponse.json({
    totalRevenue,
    totalOrders,
    totalCustomers,
    avgOrderValue,
    recentOrders,
    revenueByDay: revenueByDay.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue ?? 0),
      orders: r.orders,
    })),
  });
}
