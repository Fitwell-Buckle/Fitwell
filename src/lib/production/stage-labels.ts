import "server-only";
import { unstable_cache } from "next/cache";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionStageDef } from "@/lib/schema";
import { STAGES, STAGE_LABELS, type ProductionStage } from "./stages";

export type StageLabels = Record<ProductionStage, string>;
export interface StageDef {
  key: string;
  label: string;
  position: number;
  active: boolean;
}

// Cache tag for the resolved stages; bumped via revalidateTag on any edit.
export const STAGE_LABELS_CACHE_TAG = "production-stage-labels";

interface StageData {
  /** Active stage keys in pipeline order (position 0 = opening, last = terminal). */
  order: string[];
  /** key → label, including inactive stages so historical timelines still render. */
  labels: StageLabels;
  /** Every row (active + soft-deleted), ordered by position. */
  all: StageDef[];
}

const loadStageData = unstable_cache(
  async (): Promise<StageData> => {
    try {
      const rows = await db
        .select()
        .from(productionStageDef)
        .orderBy(asc(productionStageDef.position));
      if (rows.length > 0) {
        const labels: StageLabels = { ...STAGE_LABELS };
        for (const r of rows) labels[r.key] = r.label;
        const all = rows.map((r) => ({
          key: r.key,
          label: r.label,
          position: r.position,
          active: r.active,
        }));
        return { order: all.filter((s) => s.active).map((s) => s.key), labels, all };
      }
    } catch {
      // Table missing (pre-migration) → fall back to the hardcoded defaults.
    }
    return {
      order: [...STAGES],
      labels: { ...STAGE_LABELS },
      all: STAGES.map((k, i) => ({ key: k, label: STAGE_LABELS[k], position: i, active: true })),
    };
  },
  ["production-stage-data"],
  { tags: [STAGE_LABELS_CACHE_TAG] },
);

/** key → effective label (defaults + overrides), including soft-deleted stages. */
export async function getStageLabels(): Promise<StageLabels> {
  return (await loadStageData()).labels;
}

/** Active stage keys in pipeline order. */
export async function getStageOrder(): Promise<string[]> {
  return (await loadStageData()).order;
}

/** Active stages (key + label + position) in pipeline order — for the editor + dropdowns. */
export async function getStages(): Promise<StageDef[]> {
  const d = await loadStageData();
  return d.all.filter((s) => s.active);
}
