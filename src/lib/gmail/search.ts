import { parseAddressList } from "./parse-addresses";
import { ensureFreshAccessToken, getGoogleAccount } from "./token";

export interface GmailContact {
  /** Lowercased email address. */
  email: string;
  /** Display name from the header, if any. */
  name: string | null;
  /** Snippet from the most recent matching message. */
  snippet: string;
}

interface SearchResult {
  results: GmailContact[];
  error?: string;
}

/**
 * Search the *signed-in admin's* Gmail for messages matching `query` and
 * extract the distinct email addresses from their From / To headers. Returns
 * a deduped list, most-recent-message snippet attached.
 *
 * Auth: uses the OAuth access token stored on the user's `account` row by
 * NextAuth's DrizzleAdapter. Auto-refreshes when expired.
 *
 * Returns a friendly `error` on missing-token / non-Google auth — the UI
 * surfaces that as an inline message, not a 500.
 */
export async function searchAdminGmailContacts(
  userId: string,
  query: string,
): Promise<SearchResult> {
  if (!query.trim()) return { results: [] };

  const acc = await getGoogleAccount(userId);
  if (!acc?.access_token) {
    return {
      results: [],
      error:
        "Gmail isn't connected. Sign out and sign in with Google to grant access.",
    };
  }

  const accessToken = await ensureFreshAccessToken(acc);
  if (!accessToken) {
    return {
      results: [],
      error: "Couldn't refresh the Gmail session. Sign out and sign in again.",
    };
  }

  // Step 1: list message ids matching the query.
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=25`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    return {
      results: [],
      error: `Gmail search failed (${listRes.status})`,
    };
  }
  const listData = (await listRes.json()) as {
    messages?: { id: string }[];
  };
  const ids = (listData.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return { results: [] };

  // Step 2: fetch each matching message's headers + snippet in parallel.
  const messages = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!r.ok) return null;
      return (await r.json()) as {
        snippet?: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
    }),
  );

  // Step 3: parse + dedupe by email.
  const found = new Map<string, GmailContact>();
  for (const m of messages) {
    if (!m) continue;
    const headers = m.payload?.headers ?? [];
    const snippet = m.snippet ?? "";
    for (const h of headers) {
      if (!["From", "To", "Cc"].includes(h.name)) continue;
      for (const { email, name } of parseAddressList(h.value)) {
        const lower = email.toLowerCase();
        if (!found.has(lower)) {
          found.set(lower, { email: lower, name, snippet });
        }
      }
    }
  }
  return { results: Array.from(found.values()) };
}

