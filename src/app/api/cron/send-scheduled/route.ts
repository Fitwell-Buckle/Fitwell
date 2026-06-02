import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { sendGmail } from "@/lib/gmail/send";
import {
  findDueScheduledMessages,
  updateOutboundMessage,
} from "@/lib/crm/messages";

export const runtime = "nodejs";

// Sends queued messages whose scheduled time has passed, through the Gmail of
// the admin who scheduled them (outbound_message.createdByUserId), then marks
// them sent. A message with no sender on record or no recipient is skipped (it
// stays scheduled so it's visible/fixable rather than silently lost).
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await findDueScheduledMessages();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of due) {
    if (!m.createdByUserId || !m.toEmail) {
      skipped++;
      continue;
    }
    try {
      const result = await sendGmail(m.createdByUserId, {
        to: m.toEmail,
        subject: m.subject ?? "(no subject)",
        body: m.body,
      });
      if (!result.ok) {
        failed++;
        continue;
      }
      await updateOutboundMessage(m.id, { status: "sent" });
      sent++;
    } catch (err) {
      console.error(`send-scheduled: failed for message ${m.id}`, err);
      failed++;
    }
  }

  return NextResponse.json({ data: { due: due.length, sent, skipped, failed } });
}
