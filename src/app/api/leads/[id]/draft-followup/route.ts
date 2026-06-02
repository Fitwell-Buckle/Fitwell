import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DRAFT_MODEL_NAME, draftFollowupEmail } from "@/lib/ai/anthropic";
import { getLead } from "@/lib/crm/service";
import { createOutboundMessage } from "@/lib/crm/messages";
import { getFollowupSettings } from "@/lib/crm/followup-settings";

export const runtime = "nodejs";

// Draft an initial follow-up email for a lead (from its notes + context) and
// queue it in Next Steps. Called fire-and-forget by the capture/create flow
// right after a lead is saved (with `?auto=1`), and by the manual "Draft
// follow-up email" button (no param). The Settings → Lead follow-ups "initial
// draft" rule gates ONLY the automatic path — the manual button always drafts.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Vision model not configured — set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  // The automatic on-capture draft respects the settings toggle; manual doesn't.
  const isAuto = new URL(req.url).searchParams.get("auto") === "1";
  if (isAuto) {
    const settings = await getFollowupSettings();
    if (!settings.initialDraftEnabled) {
      return NextResponse.json({ data: { skipped: true } });
    }
  }

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  try {
    const draft = await draftFollowupEmail({
      firstName: lead.firstName,
      lastName: lead.lastName,
      companyName: lead.companyName,
      title: lead.title,
      stage: lead.stage,
      notes: lead.notes,
      fromName: session.user.name ?? null,
    });
    const result = await createOutboundMessage({
      leadId: lead.id,
      toEmail: lead.email,
      subject: draft.subject,
      body: draft.body,
      generatedByModel: DRAFT_MODEL_NAME,
      createdByUserId: session.user.id,
    });
    return NextResponse.json({ data: { id: result.id } }, { status: 201 });
  } catch (err) {
    console.error("draft-followup failed:", err);
    return NextResponse.json({ error: "Draft failed" }, { status: 500 });
  }
}
