/**
 * Backfill: move each trade-show vendor's legacy single-contact fields
 * (`contact_name` / `email` / `phone` / `title`) into a primary
 * `trade_show_vendor_contact` row. Idempotent — vendors that already have any
 * contact row are skipped, and vendors with no contact info are skipped too.
 *
 * Run against dev:
 *   npm run backfill:trade-show-contacts
 * Run against prod (after migration 0078 is applied to prod):
 *   dotenv -e .env.production.local -- tsx scripts/backfill-trade-show-contacts.ts
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tradeShowVendor, tradeShowVendorContact } from "@/lib/schema";
import { splitContactName } from "@/lib/tradeshows/validation";
import { toNameCase } from "@/lib/crm/names";

async function main() {
  const vendors = await db.select().from(tradeShowVendor);
  let created = 0;
  let skipped = 0;

  for (const v of vendors) {
    const existing = await db.query.tradeShowVendorContact.findFirst({
      where: eq(tradeShowVendorContact.vendorId, v.id),
      columns: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    // Nothing to carry over → no contact row.
    if (!v.contactName && !v.email && !v.phone && !v.title) {
      skipped++;
      continue;
    }
    const { firstName, lastName } = splitContactName(v.contactName);
    await db.insert(tradeShowVendorContact).values({
      vendorId: v.id,
      firstName: toNameCase(firstName),
      lastName: toNameCase(lastName),
      title: v.title || null,
      email: v.email || null,
      phone: v.phone || null,
      cardImageUrl: v.cardImageUrl || null,
      cardRawText: v.cardRawText || null,
      ocrConfidence: v.ocrConfidence ?? null,
      isPrimary: true,
    });
    created++;
  }

  console.log(
    `Backfill done: ${created} primary contacts created, ${skipped} vendors skipped (already had a contact or no contact info).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
