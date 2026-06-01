import { NextRequest, NextResponse } from "next/server";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { scanCustomerMessages } from "@/lib/crm/customer-messages";

export const runtime = "nodejs";
// Safety net for the Gmail scans across mailboxes. Runs every 15 min.
export const maxDuration = 30;

// Scan connected team inboxes for recent inbound mail from existing customers
// (matched by stored email), record new ones, and raise an in-app notification
// per match. No-ops until Gmail is connected/enabled. De-duped on gmail id.
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await scanCustomerMessages();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("customer-messages scan failed:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
