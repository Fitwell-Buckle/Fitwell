import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { order } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { upsertOrder, upsertCustomer } from "./sync";
import type { ShopifyOrder, ShopifyCustomer } from "@/types/shopify";

export function verifyWebhook(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("SHOPIFY_WEBHOOK_SECRET not configured");
    return false;
  }

  const hmac = createHmac("sha256", secret).update(body).digest("base64");

  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function handleWebhookTopic(
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const start = Date.now();
  const shopifyId = payload.id as number | undefined;

  switch (topic) {
    case "orders/create":
    case "orders/updated": {
      const shopifyOrder = payload as unknown as ShopifyOrder;
      await upsertOrder(shopifyOrder);
      console.log(
        `Webhook ${topic}: order ${shopifyId} processed in ${Date.now() - start}ms`,
      );
      break;
    }

    case "customers/create":
    case "customers/update": {
      const shopifyCustomer = payload as unknown as ShopifyCustomer;
      await upsertCustomer(shopifyCustomer);
      console.log(
        `Webhook ${topic}: customer ${shopifyId} processed in ${Date.now() - start}ms`,
      );
      break;
    }

    case "refunds/create": {
      // A refund payload includes order_id referencing the parent order
      const orderId = payload.order_id as number | undefined;
      if (orderId) {
        const orderShopifyId = String(orderId);
        await db
          .update(order)
          .set({
            financialStatus: "refunded",
            updatedAt: new Date(),
          })
          .where(eq(order.shopifyId, orderShopifyId));
      }
      console.log(
        `Webhook ${topic}: refund for order ${payload.order_id} processed in ${Date.now() - start}ms`,
      );
      break;
    }

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }
}
