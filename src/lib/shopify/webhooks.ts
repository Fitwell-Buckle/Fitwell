import { createHmac, timingSafeEqual } from "crypto";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { order, invoice } from "@/lib/schema";
import { eq, or } from "drizzle-orm";
import { markDepositPaid, markBalancePaid } from "@/lib/invoicing/service";
import { notifyB2bPayment } from "@/lib/invoicing/order-notifications";
import {
  classifyDraftPayment,
  paymentAmountCents,
} from "@/lib/invoicing/payment-reconcile";
import { upsertOrder, upsertCustomer } from "./sync";
import { syncProductBarcodes } from "./sku-barcode-sync";
import { syncGiftOrderLogistics } from "@/lib/creators/gift-logistics";
import { CATALOG_CACHE_TAG } from "@/lib/catalog/load";
import type { ShopifyOrder, ShopifyCustomer, ShopifyProduct } from "@/types/shopify";

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
      // Creator sample logistics: link gifting draft orders to their real
      // orders + stamp shipped/delivered from fulfillments. Never fatal —
      // a logistics hiccup must not fail order ingestion.
      try {
        await syncGiftOrderLogistics(payload);
      } catch (e) {
        console.error(`Gift logistics sync failed for order ${shopifyId}:`, e);
      }
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

    // Any product or collection change drops the cached catalog so the item
    // chooser picks it up on the next load (instead of waiting out the TTL).
    case "products/create":
    case "products/update":
    case "products/delete":
    case "collections/create":
    case "collections/update":
    case "collections/delete":
    case "collection_listings/add":
    case "collection_listings/remove":
    case "collection_listings/update": {
      revalidateTag(CATALOG_CACHE_TAG);
      console.log(`Webhook ${topic}: catalog cache invalidated`);

      // On product create/update, keep barcode = sku for any variant that's
      // drifted (new SKU added, SKU edited, etc.). The pure-plan step inside
      // syncProductBarcodes is a no-op when every variant is already in sync,
      // so this terminates after the one extra `products/update` Shopify fires
      // in response to our own barcode write. Failures (missing write_products
      // scope, transient API errors) are logged but never block the webhook —
      // the next edit, or the manual backfill script, can recover.
      if (topic === "products/create" || topic === "products/update") {
        try {
          const product = payload as unknown as ShopifyProduct;
          const plan = await syncProductBarcodes(product);
          if (plan.updates.length > 0) {
            console.log(
              `Webhook ${topic}: synced barcode for ${plan.updates.length} variant(s) on product ${plan.productId}`,
            );
          }
        } catch (err) {
          console.warn(
            `Webhook ${topic}: barcode sync failed for product ${shopifyId}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      break;
    }

    // A portal pay-link is a Shopify draft-order invoice; when it's paid the
    // draft order's status flips to "completed". Reconcile that back to the B2B
    // invoice: auto-mark it paid (deposit / balance / full) and notify admins.
    case "draft_orders/update": {
      const status = payload.status as string | undefined;
      const draftId = shopifyId != null ? String(shopifyId) : null;
      if (status === "completed" && draftId) {
        try {
          await reconcileDraftPaid(draftId);
        } catch (e) {
          console.error(`Draft-paid reconcile failed for draft ${draftId}:`, e);
        }
      }
      console.log(
        `Webhook ${topic}: draft ${shopifyId} status=${status} in ${Date.now() - start}ms`,
      );
      break;
    }

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }
}

/**
 * Match a completed draft order to its B2B invoice and record the payment:
 * auto-mark deposit/balance/full paid and notify admins. Idempotent — the mark
 * helpers 409 on a double-mark, so a redelivered webhook neither re-flips the
 * status nor re-notifies (we only notify when the mark returns ok).
 */
async function reconcileDraftPaid(draftOrderId: string): Promise<void> {
  const inv = await db.query.invoice.findFirst({
    where: or(
      eq(invoice.shopifyDraftOrderId, draftOrderId),
      eq(invoice.shopifyBalanceDraftOrderId, draftOrderId),
    ),
    columns: {
      id: true,
      invoiceNumber: true,
      totalCents: true,
      depositCents: true,
      depositPaidAt: true,
      shopifyDraftOrderId: true,
      shopifyBalanceDraftOrderId: true,
    },
    with: { company: { columns: { name: true } } },
  });
  if (!inv) return;

  const kind = classifyDraftPayment(inv, draftOrderId);
  if (!kind) return;

  const result = kind === "deposit" ? await markDepositPaid(inv.id) : await markBalancePaid(inv.id);
  if (!result.ok) return; // already paid → no duplicate notification

  await notifyB2bPayment({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    companyName: inv.company?.name ?? "—",
    amountCents: paymentAmountCents(inv.totalCents, inv.depositCents, kind),
    kind,
  });
}
