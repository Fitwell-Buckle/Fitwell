import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { getFollowupSettings } from "@/lib/crm/followup-settings";
import {
  generateSentFollowups,
  scanSentEmails,
  scanSentForLeads,
} from "@/lib/crm/sent-followups";

export const runtime = "nodejs";

// Daily: scan connected admins' Gmail Sent folders for emails to known
// leads/customers/suppliers, then — for any sent ≥N days ago (Settings → Lead
// follow-ups, default 14) with no reply — draft a threaded follow-up (reply in
// the original thread) into Next Steps. Replaces the old platform-only nudge.
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

  // Refresh tracking: a recent-window sweep (covers customers/suppliers) plus a
  // targeted per-lead search (reliably catches leads even in busy Sent folders),
  // then generate follow-ups for anything now past the wait with no reply.
  const scan = await scanSentEmails();
  const leadScan = await scanSentForLeads();
  const generated = await generateSentFollowups(settings.nudgeAfterDays);

  return NextResponse.json({
    data: { ...scan, leadScan, ...generated },
  });
}
