import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { DRAFT_MODEL_NAME, draftFollowupEmail } from "@/lib/ai/anthropic";
import { hasInboundEmailFrom } from "@/lib/gmail/inbound";
import { setLeadReplied } from "@/lib/crm/service";
import {
  createOutboundMessage,
  findLeadsNeedingNudge,
} from "@/lib/crm/messages";
import { getFollowupSettings } from "@/lib/crm/followup-settings";

export const runtime = "nodejs";

// Daily: for each lead whose initial follow-up was sent N days ago (the wait
// period configured in Settings → Lead follow-ups) with no reply, draft a
// gentle second follow-up into "Next Steps". If the lead's owner Gmail shows
// they replied, mark the lead replied and skip. The wait period + an on/off
// toggle live in the lead_followup_settings table.
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    );
  }

  const settings = await getFollowupSettings();
  if (!settings.enabled) {
    return NextResponse.json({ data: { disabled: true } });
  }

  const candidates = await findLeadsNeedingNudge(settings.nudgeAfterDays);
  let drafted = 0;
  let skippedReplied = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      // Reply check against the owner's (fallback: capturer's) Gmail.
      const checkUserId = c.ownerUserId ?? c.capturedByUserId;
      if (c.email && checkUserId) {
        const { replied, checked } = await hasInboundEmailFrom(
          checkUserId,
          c.email,
          c.sentAt,
        );
        if (checked && replied) {
          await setLeadReplied(c.leadId, new Date());
          skippedReplied++;
          continue;
        }
      }

      const draft = await draftFollowupEmail({
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.companyName,
        title: c.title,
        stage: c.stage,
        notes: c.notes,
        isNudge: true,
      });
      await createOutboundMessage({
        leadId: c.leadId,
        toEmail: c.email,
        subject: draft.subject,
        body: draft.body,
        sequenceStep: 2,
        generatedByModel: DRAFT_MODEL_NAME,
      });
      drafted++;
    } catch (err) {
      console.error(`lead-followups: failed for lead ${c.leadId}`, err);
      failed++;
    }
  }

  return NextResponse.json({
    data: { candidates: candidates.length, drafted, skippedReplied, failed },
  });
}
