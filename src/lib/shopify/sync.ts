import { db } from "@/lib/db";
import { customer, order, orderLineItem } from "@/lib/schema";
import { getShopifyClient } from "./client";
import { eq } from "drizzle-orm";

export async function syncOrders(): Promise<{ synced: number }> {
  const shopify = getShopifyClient();
  let synced = 0;
  let sinceId: string | undefined;

  // Paginate through all orders
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await shopify.getOrders({
      limit: 50,
      since_id: sinceId,
      status: "any",
    });

    for (const shopifyOrder of result.data) {
      const shopifyId = String(shopifyOrder.id);

      // Upsert customer first
      let customerId: string | null = null;
      if (shopifyOrder.customer) {
        const custShopifyId = String(shopifyOrder.customer.id);
        const existing = await db.query.customer.findFirst({
          where: eq(customer.shopifyId, custShopifyId),
        });

        if (existing) {
          customerId = existing.id;
        } else {
          const [inserted] = await db
            .insert(customer)
            .values({
              shopifyId: custShopifyId,
              email: shopifyOrder.customer.email,
              firstName: shopifyOrder.customer.first_name,
              lastName: shopifyOrder.customer.last_name,
              phone: shopifyOrder.customer.phone,
            })
            .returning({ id: customer.id });
          customerId = inserted.id;
        }
      }

      // Upsert order
      const existing = await db.query.order.findFirst({
        where: eq(order.shopifyId, shopifyId),
      });

      const orderValues = {
        shopifyId,
        shopifyOrderNumber: shopifyOrder.order_number,
        customerId,
        totalPrice: Math.round(parseFloat(shopifyOrder.total_price) * 100),
        subtotalPrice: Math.round(
          parseFloat(shopifyOrder.subtotal_price) * 100,
        ),
        currency: shopifyOrder.currency,
        financialStatus: shopifyOrder.financial_status,
        fulfillmentStatus: shopifyOrder.fulfillment_status,
        processedAt: new Date(shopifyOrder.processed_at),
      };

      let orderId: string;
      if (existing) {
        await db
          .update(order)
          .set({ ...orderValues, updatedAt: new Date() })
          .where(eq(order.id, existing.id));
        orderId = existing.id;
      } else {
        const [inserted] = await db
          .insert(order)
          .values(orderValues)
          .returning({ id: order.id });
        orderId = inserted.id;
      }

      // Upsert line items
      for (const item of shopifyOrder.line_items) {
        await db.insert(orderLineItem).values({
          orderId,
          shopifyProductId: String(item.product_id),
          shopifyVariantId: String(item.variant_id),
          title: item.title,
          variantTitle: item.variant_title,
          sku: item.sku,
          quantity: item.quantity,
          price: Math.round(parseFloat(item.price) * 100),
        });
      }

      synced++;
    }

    if (!result.pageInfo.hasNextPage) break;
    sinceId = result.pageInfo.endCursor ?? undefined;
  }

  return { synced };
}

export async function syncCustomers(): Promise<{ synced: number }> {
  const shopify = getShopifyClient();
  let synced = 0;
  let sinceId: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await shopify.getCustomers({
      limit: 50,
      since_id: sinceId,
    });

    for (const shopifyCustomer of result.data) {
      const shopifyId = String(shopifyCustomer.id);
      const existing = await db.query.customer.findFirst({
        where: eq(customer.shopifyId, shopifyId),
      });

      const values = {
        shopifyId,
        email: shopifyCustomer.email,
        firstName: shopifyCustomer.first_name,
        lastName: shopifyCustomer.last_name,
        phone: shopifyCustomer.phone,
        totalSpent: Math.round(parseFloat(shopifyCustomer.total_spent) * 100),
        orderCount: shopifyCustomer.orders_count,
        tags: shopifyCustomer.tags
          ? shopifyCustomer.tags.split(",").map((t) => t.trim())
          : [],
      };

      if (existing) {
        await db
          .update(customer)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(customer.id, existing.id));
      } else {
        await db.insert(customer).values(values);
      }

      synced++;
    }

    if (!result.pageInfo.hasNextPage) break;
    sinceId = result.pageInfo.endCursor ?? undefined;
  }

  return { synced };
}
