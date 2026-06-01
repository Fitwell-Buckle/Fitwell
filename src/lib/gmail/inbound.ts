import { buildReplyQuery } from "./reply-query";
import { ensureFreshAccessToken, getGoogleAccount } from "./token";

export { buildReplyQuery };

export interface ReplyCheck {
  // True when at least one inbound message from the address exists since the date.
  replied: boolean;
  // False when we couldn't check (no connected Google account / token / API error)
  // — callers should treat "not checked" as "no confirmed reply".
  checked: boolean;
}

// Does `fromEmail` appear as a sender in `userId`'s Gmail since `since`?
// Uses the user's stored Google OAuth token (auto-refreshed). Never throws —
// returns {checked:false} on any failure so the caller can decide.
export async function hasInboundEmailFrom(
  userId: string,
  fromEmail: string,
  since: Date,
): Promise<ReplyCheck> {
  if (!fromEmail) return { replied: false, checked: false };
  try {
    const acc = await getGoogleAccount(userId);
    if (!acc?.access_token) return { replied: false, checked: false };
    const token = await ensureFreshAccessToken(acc);
    if (!token) return { replied: false, checked: false };

    const q = buildReplyQuery(fromEmail, since);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { replied: false, checked: false };
    const data = (await res.json()) as { messages?: { id: string }[] };
    return { replied: (data.messages?.length ?? 0) > 0, checked: true };
  } catch {
    return { replied: false, checked: false };
  }
}
