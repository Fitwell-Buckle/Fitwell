import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";
import { parseAddressList } from "./parse-addresses";

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

  const acc = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.provider, "google")),
  });
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

/**
 * Returns a usable access token, refreshing via the stored `refresh_token` if
 * the current one is expired. On success, persists the new token + expiry
 * back to the `account` row. Returns null when refresh isn't possible.
 */
async function ensureFreshAccessToken(acc: {
  userId: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}): Promise<string | null> {
  if (!acc.access_token) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  // Treat as expired with 60s of slack.
  const valid = acc.expires_at == null || acc.expires_at > nowSec + 60;
  if (valid) return acc.access_token;

  if (!acc.refresh_token) return null;

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: acc.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  await db
    .update(account)
    .set({ access_token: data.access_token, expires_at: expiresAt })
    .where(
      and(eq(account.userId, acc.userId), eq(account.provider, "google")),
    );
  return data.access_token;
}

