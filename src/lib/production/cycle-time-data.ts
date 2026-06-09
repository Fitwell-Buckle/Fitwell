import { and, gte, isNotNull, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionStageEvent, productionPoLineItem } from "@/lib/schema";
import {
  buildStageEstimates,
  emptyCycleTimeSamples,
  pushCycleTimeSample,
  type CycleTimeSamples,
} from "./cycle-time";
import { getStageOrder } from "./stage-labels";
import type { ProductionStage } from "./stages";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

/**
 * Per-stage duration estimates (days) assembled from the last 30 days of
 * completed stage transitions. A transition's duration is exitedAt − enteredAt;
 * stages with ≥ MIN_SAMPLES recent samples use their rolling average, the rest
 * fall back to the hardcoded defaults (see cycle-time.ts).
 *
 * Used for the at-a-glance ETA on the timeline chart (one number per stage,
 * applied to every line). The per-line / per-stage seeder uses the richer
 * tiered estimator built from `getCycleTimeSamples()` below.
 */
export async function getStageEstimates(): Promise<Record<ProductionStage, number>> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * MS_PER_DAY);

  const events = await db
    .select({
      stage: productionStageEvent.stage,
      enteredAt: productionStageEvent.enteredAt,
      exitedAt: productionStageEvent.exitedAt,
    })
    .from(productionStageEvent)
    .where(
      and(
        isNotNull(productionStageEvent.exitedAt),
        gte(productionStageEvent.exitedAt, cutoff),
      ),
    );

  const samplesByStage: Partial<Record<ProductionStage, number[]>> = {};
  for (const e of events) {
    if (!e.exitedAt) continue;
    const days = (e.exitedAt.getTime() - e.enteredAt.getTime()) / MS_PER_DAY;
    if (days < 0) continue;
    (samplesByStage[e.stage] ??= []).push(days);
  }

  return buildStageEstimates(await getStageOrder(), samplesByStage);
}

/**
 * Bucketed per-unit cycle-time samples for the tiered estimator used by the
 * sub-PO stage-target seeder. Walks the last 30 days of completed stage
 * transitions, normalizes each event's duration by its line's quantity
 * (`days / qty` = days_per_unit), and bins by `(sku, stage)`,
 * `(productId, stage)`, and `(stage)` — the three sample tiers consumed by
 * `estimateLineStageDays()`.
 *
 * Pure / DB-free aggregation lives in `cycle-time.ts`.
 */
export async function getCycleTimeSamples(): Promise<CycleTimeSamples> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * MS_PER_DAY);

  // Join through to the line item so we can read sku, shopifyProductId and
  // quantity for the per-unit normalization. We don't gather these elsewhere
  // because the flat-estimate `getStageEstimates()` doesn't need them.
  const rows = await db
    .select({
      stage: productionStageEvent.stage,
      enteredAt: productionStageEvent.enteredAt,
      exitedAt: productionStageEvent.exitedAt,
      sku: productionPoLineItem.sku,
      shopifyProductId: productionPoLineItem.shopifyProductId,
      quantity: productionPoLineItem.quantity,
    })
    .from(productionStageEvent)
    .innerJoin(
      productionPoLineItem,
      eq(productionStageEvent.lineItemId, productionPoLineItem.id),
    )
    .where(
      and(
        isNotNull(productionStageEvent.exitedAt),
        gte(productionStageEvent.exitedAt, cutoff),
      ),
    );

  const samples = emptyCycleTimeSamples();
  for (const r of rows) {
    if (!r.exitedAt) continue;
    const durationDays = (r.exitedAt.getTime() - r.enteredAt.getTime()) / MS_PER_DAY;
    pushCycleTimeSample(samples, {
      sku: r.sku,
      productId: r.shopifyProductId ?? null,
      stage: r.stage,
      durationDays,
      quantity: r.quantity,
    });
  }
  return samples;
}
