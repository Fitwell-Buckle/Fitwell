import { db } from "@/lib/db";
import { customer, customerEvent } from "@/lib/schema";
import { desc, eq, count, ilike, and, gte, lte, sql } from "drizzle-orm";
import type { Pagination, CustomerFilters } from "@/lib/validation";

export async function getCustomers(
  pagination: Pagination,
  filters: CustomerFilters,
) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (filters.search) {
    conditions.push(
      sql`(${ilike(customer.email, `%${filters.search}%`)} OR ${ilike(customer.firstName, `%${filters.search}%`)} OR ${ilike(customer.lastName, `%${filters.search}%`)})`,
    );
  }
  if (filters.minSpent !== undefined) {
    conditions.push(gte(customer.totalSpent, filters.minSpent));
  }
  if (filters.maxSpent !== undefined) {
    conditions.push(lte(customer.totalSpent, filters.maxSpent));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [customers, totalResult] = await Promise.all([
    db
      .select()
      .from(customer)
      .where(where)
      .orderBy(desc(customer.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(customer).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;

  return {
    data: customers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCustomerById(id: string) {
  return db.query.customer.findFirst({
    where: eq(customer.id, id),
    with: {
      orders: true,
    },
  });
}

export async function getCustomerEvents(customerId: string) {
  return db
    .select()
    .from(customerEvent)
    .where(eq(customerEvent.customerId, customerId))
    .orderBy(desc(customerEvent.occurredAt))
    .limit(50);
}
