/**
 * DB queries feeding the pure commission math in commission.ts. Attribution is
 * code-based: a creator's discount codes joined to the orders that redeemed
 * them, netted `total_price − total_refunded` (same convention as the creator
 * detail page and the dashboard's Total sales).
 */
import { eq, inArray, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creator,
  creatorDiscountCode,
  creatorPayout,
  order,
  orderDiscountCode,
} from "@/lib/schema";
import { computeCommission, type CommissionResult } from "./commission";

/** Net revenue (total_price − total_refunded) across this creator's codes. */
async function attributedNetRevenueCents(creatorId: string): Promise<number> {
  const codes = await db
    .select({ code: creatorDiscountCode.code })
    .from(creatorDiscountCode)
    .where(eq(creatorDiscountCode.creatorId, creatorId));
  if (codes.length === 0) return 0;
  const [row] = await db
    .select({
      grossCents: sum(order.totalPrice),
      refundedCents: sum(order.totalRefunded),
    })
    .from(orderDiscountCode)
    .innerJoin(order, eq(orderDiscountCode.orderId, order.id))
    .where(
      inArray(
        orderDiscountCode.code,
        codes.map((c) => c.code),
      ),
    );
  return Number(row?.grossCents ?? 0) - Number(row?.refundedCents ?? 0);
}

async function paidCents(creatorId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(creatorPayout.amountCents) })
    .from(creatorPayout)
    .where(eq(creatorPayout.creatorId, creatorId));
  return Number(row?.total ?? 0);
}

/** Full commission picture for one creator (creator detail page). */
export async function getCommissionForCreator(
  creatorId: string,
): Promise<CommissionResult> {
  const c = await db
    .select({ rate: creator.commissionRatePct })
    .from(creator)
    .where(eq(creator.id, creatorId))
    .limit(1);
  const [net, paid] = await Promise.all([
    attributedNetRevenueCents(creatorId),
    paidCents(creatorId),
  ]);
  return computeCommission({
    attributedNetRevenueCents: net,
    commissionRatePct: c[0]?.rate ?? null,
    paidCents: paid,
  });
}

export interface CreatorCommissionRow extends CommissionResult {
  creatorId: string;
  name: string;
  offerTier: string | null;
  taxFormStatus: string;
  payoutEmail: string | null;
}

/**
 * Commission across all creators via three aggregate queries
 * (revenue-by-creator, payouts-by-creator, creator meta) rather than N+1.
 * Sorted by owed desc. Powers the "owed ≥ floor" admin view and the W-9 nudge.
 */
export async function getCreatorCommissions(): Promise<CreatorCommissionRow[]> {
  const [revenueRows, payoutRows, creatorRows] = await Promise.all([
    db
      .select({
        creatorId: creatorDiscountCode.creatorId,
        grossCents: sum(order.totalPrice),
        refundedCents: sum(order.totalRefunded),
      })
      .from(creatorDiscountCode)
      .innerJoin(
        orderDiscountCode,
        eq(orderDiscountCode.code, creatorDiscountCode.code),
      )
      .innerJoin(order, eq(order.id, orderDiscountCode.orderId))
      .groupBy(creatorDiscountCode.creatorId),
    db
      .select({
        creatorId: creatorPayout.creatorId,
        paidCents: sum(creatorPayout.amountCents),
      })
      .from(creatorPayout)
      .groupBy(creatorPayout.creatorId),
    db
      .select({
        id: creator.id,
        name: creator.name,
        rate: creator.commissionRatePct,
        offerTier: creator.offerTier,
        taxFormStatus: creator.taxFormStatus,
        payoutEmail: creator.payoutEmail,
      })
      .from(creator),
  ]);

  const netByCreator = new Map<string, number>();
  for (const r of revenueRows) {
    if (!r.creatorId) continue;
    netByCreator.set(
      r.creatorId,
      Number(r.grossCents ?? 0) - Number(r.refundedCents ?? 0),
    );
  }
  const paidByCreator = new Map<string, number>();
  for (const r of payoutRows) {
    paidByCreator.set(r.creatorId, Number(r.paidCents ?? 0));
  }

  return creatorRows
    .map((c) => ({
      ...computeCommission({
        attributedNetRevenueCents: netByCreator.get(c.id) ?? 0,
        commissionRatePct: c.rate,
        paidCents: paidByCreator.get(c.id) ?? 0,
      }),
      creatorId: c.id,
      name: c.name,
      offerTier: c.offerTier,
      taxFormStatus: c.taxFormStatus,
      payoutEmail: c.payoutEmail,
    }))
    .sort((a, b) => b.owedCents - a.owedCents);
}
