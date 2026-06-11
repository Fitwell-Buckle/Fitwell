import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { productionSettings } from "@/lib/schema";

// Single-row production settings (`production_settings`, id="default"), edited
// in admin Settings. Currently just the supplier ETA-reminder cadence; add
// future production-wide toggles here.

export const DEFAULT_ETA_REMINDER_INTERVAL_DAYS = 2;

export interface ProductionSettings {
  etaReminderEnabled: boolean;
  etaReminderIntervalDays: number;
}

export const productionSettingsSchema = z.object({
  etaReminderEnabled: z.boolean().optional(),
  // 1–90 days — guard against 0 (would email daily) and silly large values.
  etaReminderIntervalDays: z.number().int().min(1).max(90).optional(),
});
export type ProductionSettingsInput = z.infer<typeof productionSettingsSchema>;

export async function getProductionSettings(): Promise<ProductionSettings> {
  const row = await db.query.productionSettings.findFirst({
    where: eq(productionSettings.id, "default"),
  });
  return {
    etaReminderEnabled: row?.etaReminderEnabled ?? true,
    etaReminderIntervalDays:
      row?.etaReminderIntervalDays ?? DEFAULT_ETA_REMINDER_INTERVAL_DAYS,
  };
}

export async function upsertProductionSettings(
  input: ProductionSettingsInput,
): Promise<void> {
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.etaReminderEnabled !== undefined)
    fields.etaReminderEnabled = input.etaReminderEnabled;
  if (input.etaReminderIntervalDays !== undefined)
    fields.etaReminderIntervalDays = input.etaReminderIntervalDays;
  if (Object.keys(fields).length === 1) return; // only the timestamp — no-op

  await db
    .insert(productionSettings)
    .values({
      id: "default",
      etaReminderEnabled: input.etaReminderEnabled ?? true,
      etaReminderIntervalDays:
        input.etaReminderIntervalDays ?? DEFAULT_ETA_REMINDER_INTERVAL_DAYS,
    })
    .onConflictDoUpdate({ target: productionSettings.id, set: fields });
}
