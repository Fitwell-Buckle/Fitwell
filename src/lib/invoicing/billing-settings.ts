import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { billingSettings } from "@/lib/schema";

// Bank-wire / remittance info shown on B2B invoices is a single free-text field
// (line breaks + bold preserved), edited via the "Wire info" Setup modal on the
// B2B Orders page.
export const billingSettingsSchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;
export type BillingSettings = typeof billingSettings.$inferSelect;

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t || null;
}

export async function getBillingSettings(): Promise<BillingSettings | null> {
  const row = await db.query.billingSettings.findFirst({
    where: eq(billingSettings.id, "default"),
  });
  return row ?? null;
}

export async function upsertBillingSettings(input: BillingSettingsInput): Promise<void> {
  if (input.instructions === undefined) return;
  const fields = { instructions: clean(input.instructions), updatedAt: new Date() };
  await db
    .insert(billingSettings)
    .values({ id: "default", ...fields })
    .onConflictDoUpdate({ target: billingSettings.id, set: fields });
}
