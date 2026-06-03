import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sendGmail } from "@/lib/gmail/send";
import {
  isValidRecipientList,
  normalizeRecipients,
} from "@/lib/crm/email-recipients";
import { logSentMessage } from "@/lib/crm/messages";

export const runtime = "nodejs";

const schema = z.object({
  to: z.string().email().max(320),
  subject: z.string().max(500),
  body: z.string().min(1).max(20_000),
  // Optional comma-separated Cc / Bcc lists.
  cc: z
    .string()
    .max(1000)
    .nullish()
    .refine(isValidRecipientList, { message: "Cc has an invalid email" }),
  bcc: z
    .string()
    .max(1000)
    .nullish()
    .refine(isValidRecipientList, { message: "Bcc has an invalid email" }),
  // The Gmail thread being replied to (for threading + a sent-row record).
  threadId: z.string().max(200).nullish(),
  inReplyTo: z.string().max(998).nullish(),
});

// Send a composed reply from the signed-in admin's Gmail (From = their
// account). Requires the gmail.send scope + the Gmail API enabled. Returns a
// clear 409 message when either isn't set up yet.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  // One token: embed it as the open-tracking pixel AND key the sent-row we log
  // on success, so the open hits the right record.
  const trackToken = crypto.randomUUID();
  const cc = normalizeRecipients(input.cc);
  const bcc = normalizeRecipients(input.bcc);
  const result = await sendGmail(session.user.id, {
    to: input.to,
    subject: input.subject || "(no subject)",
    body: input.body,
    cc,
    bcc,
    threadId: input.threadId,
    inReplyTo: input.inReplyTo,
    trackToken,
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

  // Record the sent reply so its opens are tracked alongside queued sends.
  // Best-effort — the email already went out; don't fail the request on this.
  try {
    await logSentMessage({
      toEmail: input.to,
      cc,
      bcc,
      subject: input.subject || null,
      body: input.body,
      threadId: input.threadId,
      inReplyTo: input.inReplyTo,
      createdByUserId: session.user.id,
      trackToken,
    });
  } catch (err) {
    console.error("compose send: logSentMessage failed", err);
  }

  return NextResponse.json({ data: { ok: true } });
}
