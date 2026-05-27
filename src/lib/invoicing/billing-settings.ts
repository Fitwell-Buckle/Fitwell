import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { billingSettings } from "@/lib/schema";

export const billingSettingsSchema = z.object({
  bankName: z.string().max(200).nullish(),
  accountName: z.string().max(200).nullish(),
  accountNumber: z.string().max(100).nullish(),
  routingNumber: z.string().max(100).nullish(),
  swiftBic: z.string().max(100).nullish(),
  iban: z.string().max(100).nullish(),
  instructions: z.string().max(2000).nullish(),
});
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;
export type BillingSettings = typeof billingSettings.$inferSelect;

/** True when at least one remittance field is filled in (worth rendering). */
export function hasRemittance(s: BillingSettings | null): boolean {
  if (!s) return false;
  return Boolean(
    s.bankName ||
      s.accountName ||
      s.accountNumber ||
      s.routingNumber ||
      s.swiftBic ||
      s.iban ||
      s.instructions,
  );
}

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

// Merge only the fields actually present in `input` (undefined = "leave as-is"),
// so partial editors like the Wire Info modal don't wipe the bank fields.
export async function upsertBillingSettings(input: BillingSettingsInput): Promise<void> {
  const fields: Partial<typeof billingSettings.$inferInsert> = { updatedAt: new Date() };
  const keys = [
    "bankName",
    "accountName",
    "accountNumber",
    "routingNumber",
    "swiftBic",
    "iban",
    "instructions",
  ] as const;
  for (const k of keys) {
    if (input[k] !== undefined) fields[k] = clean(input[k]);
  }
  await db
    .insert(billingSettings)
    .values({ id: "default", ...fields })
    .onConflictDoUpdate({ target: billingSettings.id, set: fields });
}
