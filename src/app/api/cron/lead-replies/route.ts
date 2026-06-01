import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminNotification } from "@/lib/schema";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { hasInboundEmailFrom } from "@/lib/gmail/inbound";
import { leadDisplayName } from "@/lib/crm/display";
import {
  listLeadsForReplyCheck,
  markLeadReplyNotified,
} from "@/lib/crm/service";

export const runtime = "nodejs";

// Periodically check active leads' owner Gmail for new inbound replies and
// raise an in-app notification ("X replied") so it shows in the main
// Notifications inbox + bell. De-duped via lead.replies_notified_at: only a
// reply newer than the last notification fires a new one. Requires the Gmail
// API to be enabled (see specs/current/integrations.md); otherwise the checks
// no-op (checked=false).
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leads = await listLeadsForReplyCheck(50);
  let notified = 0;
  let checked = 0;

  for (const lead of leads) {
    const mailbox = lead.ownerUserId ?? lead.capturedByUserId;
    if (!lead.email || !mailbox) continue;
    const since = lead.repliesNotifiedAt ?? lead.createdAt ?? new Date(0);
    const res = await hasInboundEmailFrom(mailbox, lead.email, since);
    if (!res.checked) continue;
    checked++;
    if (!res.replied) continue;

    const name = leadDisplayName(lead);
    try {
      await db.insert(adminNotification).values({
        type: "lead_reply",
        title: `${name} replied`,
        body: lead.email,
        leadId: lead.id,
      });
      await markLeadReplyNotified(lead.id, new Date());
      notified++;
    } catch (err) {
      console.error(`lead-replies: notify failed for ${lead.id}`, err);
    }
  }

  return NextResponse.json({
    data: { candidates: leads.length, checked, notified },
  });
}
