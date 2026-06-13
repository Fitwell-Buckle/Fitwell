import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAdminNotification } from "@/lib/notifications/admin-notify";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import {
  hasInboundEmailFrom,
  listConnectedMailboxes,
} from "@/lib/gmail/inbound";
import { leadDisplayName } from "@/lib/crm/display";
import {
  listLeadsForReplyCheck,
  markLeadReplyNotified,
} from "@/lib/crm/service";

export const runtime = "nodejs";
// Safety net for the (parallelized) Gmail checks; well above the ~2-3s a run
// actually takes. Runs every 5 min (vercel.json).
export const maxDuration = 30;

// How many lead mailboxes to check concurrently. Bounded so we stay under
// Gmail's per-user rate limit (~250 quota units/sec; each check ≈ 5 units).
const CONCURRENCY = 8;

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
  // Map mailbox userId → display label/email so each reply notification can be
  // tagged with the inbox it was found in (drives the notifications color +
  // filter, matching the messaging views).
  const mailboxById = new Map(
    (await listConnectedMailboxes()).map((m) => [m.userId, m]),
  );
  let notified = 0;
  let checked = 0;

  // Check mailboxes in bounded-concurrency batches to keep the run fast and
  // under Gmail's rate limit; record found replies as we go.
  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    const batch = leads.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (lead) => {
        const mailbox = lead.ownerUserId ?? lead.capturedByUserId;
        if (!lead.email || !mailbox) return null;
        const since = lead.repliesNotifiedAt ?? lead.createdAt ?? new Date(0);
        const res = await hasInboundEmailFrom(mailbox, lead.email, since);
        return { lead, res };
      }),
    );

    for (const r of results) {
      if (!r || !r.res.checked) continue;
      checked++;
      if (!r.res.replied) continue;
      try {
        const mb = mailboxById.get(
          r.lead.ownerUserId ?? r.lead.capturedByUserId ?? "",
        );
        await createAdminNotification({
          type: "lead_reply",
          title: `${leadDisplayName(r.lead)} replied`,
          body: r.lead.email,
          leadId: r.lead.id,
          mailboxLabel: mb?.label ?? null,
          mailboxEmail: mb?.email ?? null,
        });
        await markLeadReplyNotified(r.lead.id, new Date());
        notified++;
      } catch (err) {
        console.error(`lead-replies: notify failed for ${r.lead.id}`, err);
      }
    }
  }

  return NextResponse.json({
    data: { candidates: leads.length, checked, notified },
  });
}
