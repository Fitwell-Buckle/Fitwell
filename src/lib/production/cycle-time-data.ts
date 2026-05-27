import { and, gte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionStageEvent } from "@/lib/schema";
import { buildStageEstimates } from "./cycle-time";
import { getStageOrder } from "./stage-labels";
import type { ProductionStage } from "./stages";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

/**
 * Per-stage duration estimates (days) assembled from the last 30 days of
 * completed stage transitions. A transition's duration is exitedAt − enteredAt;
 * stages with ≥ MIN_SAMPLES recent samples use their rolling average, the rest
 * fall back to the hardcoded defaults (see cycle-time.ts).
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
