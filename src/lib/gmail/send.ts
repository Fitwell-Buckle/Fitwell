import { ensureFreshAccessToken, getGoogleAccount } from "./token";

export interface SendResult {
  ok: boolean;
  // Reason codes the caller can map to a user message / status.
  error?: "no_account" | "no_token" | "insufficient_scope" | "send_failed";
}

// RFC 2047 "encoded-word" for a possibly-non-ASCII subject line.
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildRawMessage(to: string, subject: string, body: string): string {
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  // CRLF line endings per RFC 5322; blank line separates headers from body.
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

// Send a plain-text email from `userId`'s Gmail (From = that account). Uses the
// stored Google OAuth token (auto-refreshed). Never throws — returns a reason
// code on failure so the route can surface a clear message. Requires the
// `gmail.send` scope; if the user authorized before that scope was added,
// Gmail returns 403 → "insufficient_scope" (they must re-sign-in).
export async function sendGmail(
  userId: string,
  msg: { to: string; subject: string; body: string },
): Promise<SendResult> {
  const acc = await getGoogleAccount(userId);
  if (!acc?.access_token) return { ok: false, error: "no_account" };
  const token = await ensureFreshAccessToken(acc);
  if (!token) return { ok: false, error: "no_token" };

  const raw = Buffer.from(
    buildRawMessage(msg.to, msg.subject, msg.body),
    "utf8",
  ).toString("base64url");

  try {
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    if (res.ok) return { ok: true };
    if (res.status === 403 || res.status === 401) {
      return { ok: false, error: "insufficient_scope" };
    }
    return { ok: false, error: "send_failed" };
  } catch {
    return { ok: false, error: "send_failed" };
  }
}
