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

export async function upsertBillingSettings(input: BillingSettingsInput): Promise<void> {
  const fields = {
    bankName: clean(input.bankName),
    accountName: clean(input.accountName),
    accountNumber: clean(input.accountNumber),
    routingNumber: clean(input.routingNumber),
    swiftBic: clean(input.swiftBic),
    iban: clean(input.iban),
    instructions: clean(input.instructions),
    updatedAt: new Date(),
  };
  await db
    .insert(billingSettings)
    .values({ id: "default", ...fields })
    .onConflictDoUpdate({ target: billingSettings.id, set: fields });
}
