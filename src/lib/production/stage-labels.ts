import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { productionStageLabel } from "@/lib/schema";
import { STAGES, STAGE_LABELS, type ProductionStage } from "./stages";

export type StageLabels = Record<ProductionStage, string>;

// Cache tag for the resolved labels; bumped via revalidateTag on save.
export const STAGE_LABELS_CACHE_TAG = "production-stage-labels";

const loadStageLabels = unstable_cache(
  async (): Promise<StageLabels> => {
    const labels: StageLabels = { ...STAGE_LABELS };
    try {
      const rows = await db.select().from(productionStageLabel);
      for (const r of rows) {
        const trimmed = r.label.trim();
        if (STAGES.includes(r.stage as ProductionStage) && trimmed) {
          labels[r.stage as ProductionStage] = trimmed;
        }
      }
    } catch {
      // Fall back to defaults if the table isn't there yet (pre-migration).
    }
    return labels;
  },
  ["production-stage-labels"],
  { tags: [STAGE_LABELS_CACHE_TAG] },
);

/** Effective stage labels = hardcoded defaults merged with any DB overrides. */
export function getStageLabels(): Promise<StageLabels> {
  return loadStageLabels();
}
