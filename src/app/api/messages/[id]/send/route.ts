import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendGmail } from "@/lib/gmail/send";
import {
  getOutboundMessage,
  updateOutboundMessage,
} from "@/lib/crm/messages";

export const runtime = "nodejs";

// Send a queued message through the signed-in admin's Gmail (From = their
// account), then mark it sent. Requires the gmail.send scope — if the admin
// authorized Google before that scope was added, returns 409 telling them to
// re-sign-in.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const msg = await getOutboundMessage(id);
  if (!msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (msg.status === "sent") {
    return NextResponse.json({ error: "Already sent" }, { status: 409 });
  }
  if (!msg.toEmail) {
    return NextResponse.json(
      { error: "This lead has no email address to send to." },
      { status: 400 },
    );
  }

  const result = await sendGmail(session.user.id, {
    to: msg.toEmail,
    subject: msg.subject ?? "(no subject)",
    body: msg.body,
  });

  if (!result.ok) {
    if (result.error === "api_disabled") {
      return NextResponse.json(
        {
          error:
            "The Gmail API isn't enabled for this Google Cloud project. An admin needs to enable it in the Cloud Console, then try again.",
        },
        { status: 409 },
      );
    }
    if (result.error === "insufficient_scope" || result.error === "no_account") {
      return NextResponse.json(
        {
          error:
            "Gmail send isn't authorized. Sign out and sign back in with Google to grant send access, then try again.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Gmail send failed. Try again." },
      { status: 502 },
    );
  }

  await updateOutboundMessage(id, { status: "sent" });
  return NextResponse.json({ data: { id } });
}
