import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { DRAFT_MODEL_NAME, draftFollowupEmail } from "@/lib/ai/anthropic";
import { hasInboundEmailFrom } from "@/lib/gmail/inbound";
import { setLeadReplied } from "@/lib/crm/service";
import {
  createOutboundMessage,
  findLeadsNeedingNudge,
} from "@/lib/crm/messages";

export const runtime = "nodejs";

// Days after the first follow-up was SENT before we draft a nudge.
const NUDGE_AFTER_DAYS = 14;

// Daily: for each lead whose initial follow-up was sent ~2 weeks ago with no
// reply, draft a gentle second follow-up into "Messages to Send". If the
// lead's owner Gmail shows they replied, mark the lead replied and skip.
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

  const candidates = await findLeadsNeedingNudge(NUDGE_AFTER_DAYS);
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
