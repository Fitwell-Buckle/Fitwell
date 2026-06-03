import { ensureFreshAccessToken, getGoogleAccount } from "./token";
import { plainTextToHtml } from "./mime";
import { trackingPixelUrl } from "@/lib/crm/tracking";

export interface SendResult {
  ok: boolean;
  // Reason codes the caller can map to a user message / status.
  error?:
    | "no_account"
    | "no_token"
    | "insufficient_scope"
    | "api_disabled"
    | "send_failed";
}

// RFC 2047 "encoded-word" for a possibly-non-ASCII subject line.
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildRawMessage(msg: {
  to: string;
  subject: string;
  body: string;
  cc?: string | null;
  bcc?: string | null;
  inReplyTo?: string | null;
  // When set, send as multipart text+HTML with an invisible open-tracking pixel
  // pointing at this token. Without it, send plain text exactly as before.
  trackToken?: string | null;
}): string {
  const headers = [`To: ${msg.to}`];
  // Cc is visible to all recipients; Bcc is delivered but Gmail strips the
  // header from the copies recipients receive.
  if (msg.cc) headers.push(`Cc: ${msg.cc}`);
  if (msg.bcc) headers.push(`Bcc: ${msg.bcc}`);
  headers.push(`Subject: ${encodeSubject(msg.subject)}`, "MIME-Version: 1.0");
  // Thread the reply under the original: In-Reply-To + References point Gmail
  // (and other clients) at the original Message-ID so it nests in the thread.
  if (msg.inReplyTo) {
    headers.push(`In-Reply-To: ${msg.inReplyTo}`, `References: ${msg.inReplyTo}`);
  }

  // CRLF line endings per RFC 5322; blank line separates headers from body.
  if (msg.trackToken) {
    // multipart/alternative: a plain-text part (so it still reads as a normal
    // text email) + an HTML part carrying the invisible tracking pixel.
    const boundary = `=_fitwell_${crypto.randomUUID().replace(/-/g, "")}`;
    const html = plainTextToHtml(msg.body, trackingPixelUrl(msg.trackToken));
    headers.push(
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    );
    const body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      msg.body,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    return headers.join("\r\n") + "\r\n\r\n" + body;
  }

  headers.push(
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  );
  return headers.join("\r\n") + "\r\n\r\n" + msg.body;
}

// Send a plain-text email from `userId`'s Gmail (From = that account). Uses the
// stored Google OAuth token (auto-refreshed). Never throws — returns a reason
// code on failure so the route can surface a clear message. Requires the
// `gmail.send` scope; if the user authorized before that scope was added,
// Gmail returns 403 → "insufficient_scope" (they must re-sign-in).
export async function sendGmail(
  userId: string,
  msg: {
    to: string;
    subject: string;
    body: string;
    // Optional comma-separated Cc / Bcc recipient lists.
    cc?: string | null;
    bcc?: string | null;
    // Reply in an existing Gmail thread: set both for proper threading — the
    // thread id (Gmail request) + the original Message-ID (In-Reply-To header).
    threadId?: string | null;
    inReplyTo?: string | null;
    // When set, embed an open-tracking pixel for this token (HTML multipart).
    trackToken?: string | null;
  },
): Promise<SendResult> {
  const acc = await getGoogleAccount(userId);
  if (!acc?.access_token) return { ok: false, error: "no_account" };
  const token = await ensureFreshAccessToken(acc);
  if (!token) return { ok: false, error: "no_token" };

  const raw = Buffer.from(
    buildRawMessage({
      to: msg.to,
      subject: msg.subject,
      body: msg.body,
      cc: msg.cc,
      bcc: msg.bcc,
      inReplyTo: msg.inReplyTo,
      trackToken: msg.trackToken,
    }),
    "utf8",
  ).toString("base64url");

  const payload: { raw: string; threadId?: string } = { raw };
  if (msg.threadId) payload.threadId = msg.threadId;

  try {
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) return { ok: true };
    if (res.status === 403 || res.status === 401) {
      // A 403 can mean the Gmail API is disabled for the project (account-
      // level) OR the token lacks gmail.send (scope). Distinguish so the user
      // gets the right fix.
      const text = await res.text().catch(() => "");
      if (
        /accessNotConfigured/i.test(text) ||
        /has not been used in project/i.test(text)
      ) {
        return { ok: false, error: "api_disabled" };
      }
      return { ok: false, error: "insufficient_scope" };
    }
    return { ok: false, error: "send_failed" };
  } catch {
    return { ok: false, error: "send_failed" };
  }
}
