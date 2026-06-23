import { z } from "zod";

// Pure schema/types for dashboard settings — no DB import, so it's safe to pull
// into tests and client code. The db-backed getter/upserter live in
// `settings.ts` and re-export these. (Mirrors the followup-settings split.)

export const DEFAULT_RETURN_LABEL_COST_CENTS = 700;

export interface DashboardSettings {
  /** Assumed cost (cents) of the prepaid return shipping label, per return. */
  returnLabelCostCents: number;
}

export const dashboardSettingsSchema = z.object({
  // 0–$1,000 in cents — guard against negatives and fat-fingered huge values.
  returnLabelCostCents: z.number().int().min(0).max(100_000).optional(),
});
export type DashboardSettingsInput = z.infer<typeof dashboardSettingsSchema>;
