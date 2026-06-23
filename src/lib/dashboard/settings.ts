import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboardSettings } from "@/lib/schema";
import {
  DEFAULT_RETURN_LABEL_COST_CENTS,
  type DashboardSettings,
  type DashboardSettingsInput,
} from "./settings-schema";

// Single-row dashboard settings (`dashboard_settings`, id="default"), edited in
// admin Settings. Currently just the assumed per-return shipping-label cost the
// business eats (folded into the dashboard's Avg Return Value tile). It's a
// configurable estimate: Shopify's Admin API doesn't expose the real
// merchant-paid label cost. Add future dashboard-wide knobs here.
// Pure schema/types/defaults live in `./settings-schema` (db-free, test-safe).
export {
  DEFAULT_RETURN_LABEL_COST_CENTS,
  dashboardSettingsSchema,
} from "./settings-schema";
export type { DashboardSettings, DashboardSettingsInput } from "./settings-schema";

export async function getDashboardSettings(): Promise<DashboardSettings> {
  const row = await db.query.dashboardSettings.findFirst({
    where: eq(dashboardSettings.id, "default"),
  });
  return {
    returnLabelCostCents:
      row?.returnLabelCostCents ?? DEFAULT_RETURN_LABEL_COST_CENTS,
  };
}

export async function upsertDashboardSettings(
  input: DashboardSettingsInput,
): Promise<void> {
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.returnLabelCostCents !== undefined)
    fields.returnLabelCostCents = input.returnLabelCostCents;
  if (Object.keys(fields).length === 1) return; // only the timestamp — no-op

  await db
    .insert(dashboardSettings)
    .values({
      id: "default",
      returnLabelCostCents:
        input.returnLabelCostCents ?? DEFAULT_RETURN_LABEL_COST_CENTS,
    })
    .onConflictDoUpdate({ target: dashboardSettings.id, set: fields });
}
