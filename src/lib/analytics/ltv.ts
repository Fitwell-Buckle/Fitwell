import { db } from "@/lib/db";
import { customer } from "@/lib/schema";
import { eq } from "drizzle-orm";

export interface CustomerLTV {
  customerId: string;
  totalSpent: number;
  orderCount: number;
  avgOrderValue: number;
  daysSinceFirstOrder: number;
  predictedAnnualValue: number;
}

export async function calculateCustomerLTV(
  customerId: string,
): Promise<CustomerLTV | null> {
  const cust = await db.query.customer.findFirst({
    where: eq(customer.id, customerId),
  });

  if (!cust) return null;

  const totalSpent = cust.totalSpent ?? 0;
  const orderCount = cust.orderCount ?? 0;
  const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;

  const daysSinceFirstOrder = cust.firstOrderAt
    ? Math.max(
        1,
        Math.floor(
          (Date.now() - cust.firstOrderAt.getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  // Simple annualized projection
  const predictedAnnualValue =
    daysSinceFirstOrder > 0
      ? Math.round((totalSpent / daysSinceFirstOrder) * 365)
      : 0;

  return {
    customerId,
    totalSpent,
    orderCount,
    avgOrderValue: Math.round(avgOrderValue),
    daysSinceFirstOrder,
    predictedAnnualValue,
  };
}
