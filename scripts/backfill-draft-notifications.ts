/**
 * One-off backfill: ensure every pending "Messages to Send" draft is
 * represented in the admin notifications inbox. New drafts notify on creation
 * (createOutboundMessage); this covers drafts created before that wiring.
 *
 * Idempotent: skips a lead that already has a `lead_followup_drafted`
 * notification. One notification per lead with pending drafts.
 *
 *   node --env-file=.env.local --import tsx/esm scripts/backfill-draft-notifications.ts        # dev
 *   (prod: pull prod env first, then run with that env file)
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotification, lead, outboundMessage } from "@/lib/schema";
import { leadDisplayName } from "@/lib/crm/display";

const drafts = await db
  .select({
    leadId: outboundMessage.leadId,
    subject: outboundMessage.subject,
    firstName: lead.firstName,
    lastName: lead.lastName,
    companyName: lead.companyName,
    email: lead.email,
  })
  .from(outboundMessage)
  .innerJoin(lead, eq(outboundMessage.leadId, lead.id))
  .where(eq(outboundMessage.status, "draft"));

const seen = new Set<string>();
let created = 0;
for (const d of drafts) {
  if (seen.has(d.leadId)) continue;
  seen.add(d.leadId);

  const existing = await db
    .select({ id: adminNotification.id })
    .from(adminNotification)
    .where(
      and(
        eq(adminNotification.type, "lead_followup_drafted"),
        eq(adminNotification.leadId, d.leadId),
      ),
    );
  if (existing.length > 0) continue;

  await db.insert(adminNotification).values({
    type: "lead_followup_drafted",
    title: `Draft follow-up ready for ${leadDisplayName(d)}`,
    body: d.subject,
    leadId: d.leadId,
  });
  created++;
}

console.log(`Backfill done: ${created} notification(s) created (${seen.size} leads with drafts).`);
process.exit(0);
