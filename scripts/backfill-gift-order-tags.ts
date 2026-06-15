/**
 * Backfill the `sample` + `influencer-gift` tags onto influencer gifting orders
 * that were created BEFORE buildGiftDraftOrder started tagging them. Tags the
 * Shopify draft order (and the completed order, if one exists) via `tagsAdd`,
 * which is append-only + idempotent — safe to re-run.
 *
 *   Dry run (read-only):  node --env-file=.env.X --import tsx/esm scripts/backfill-gift-order-tags.ts
 *   Apply (writes Shopify): ... scripts/backfill-gift-order-tags.ts --apply
 *
 * NOTE: tagging a *draft* order only helps revenue exclusion if Shopify carries
 * the tag onto the order when the draft is completed. Tagging the completed
 * order (when present) is what `upsertOrder` reads to set `is_sample`.
 */
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { influencerOrder } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { GIFT_ORDER_TAGS } from "@/lib/shopify/order-tags";

const APPLY = process.argv.includes("--apply");

function toGid(kind: "DraftOrder" | "Order", id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/${kind}/${id}`;
}

async function main() {
  const orders = await db.query.influencerOrder.findMany({
    where: isNotNull(influencerOrder.shopifyDraftOrderId),
    columns: {
      id: true,
      orderNumber: true,
      shopifyDraftOrderId: true,
      shopifyOrderId: true,
    },
  });
  const tags = [...GIFT_ORDER_TAGS];
  console.log(
    `${orders.length} gifting order(s) with a Shopify draft. Tags: ${tags.join(", ")}\n` +
      (APPLY ? "MODE: APPLY (writing to Shopify)\n" : "MODE: DRY RUN (no writes)\n"),
  );

  const client = getShopifyClient();
  let tagged = 0;
  let failed = 0;
  for (const o of orders) {
    const targets: string[] = [];
    if (o.shopifyDraftOrderId) targets.push(toGid("DraftOrder", o.shopifyDraftOrderId));
    if (o.shopifyOrderId) targets.push(toGid("Order", o.shopifyOrderId));

    if (!APPLY) {
      console.log(`[dry-run] ${o.orderNumber}: would tag ${targets.join(" + ")}`);
      continue;
    }
    for (const gid of targets) {
      try {
        await client.addTags(gid, tags);
        tagged++;
        console.log(`  tagged ${o.orderNumber}: ${gid}`);
      } catch (e) {
        failed++;
        console.error(`  FAILED ${o.orderNumber} ${gid}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log(
    APPLY
      ? `\nDone. tagged=${tagged} failed=${failed}`
      : `\nDry run only. Re-run with --apply to write the tags.`,
  );
  process.exit(0);
}
main().catch((e) => {
  console.error("TOP-LEVEL:", e);
  process.exit(1);
});
