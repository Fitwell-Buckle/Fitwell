import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";

export interface GoogleAccount {
  userId: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}

// The user's stored Google OAuth account row (written by NextAuth's
// DrizzleAdapter), or null if they never connected Google.
export async function getGoogleAccount(
  userId: string,
): Promise<GoogleAccount | null> {
  const acc = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.provider, "google")),
  });
  return acc ?? null;
}

// Returns a usable access token, refreshing via the stored `refresh_token`
// when the current one is expired (and persisting the refreshed token back).
// Returns null when refresh isn't possible. Works without a session — used by
// both the interactive Gmail search and the follow-up-nudge cron.
export async function ensureFreshAccessToken(
  acc: GoogleAccount,
): Promise<string | null> {
  if (!acc.access_token) return null;
  const nowSec = Math.floor(Date.now() / 1000);
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
    .where(and(eq(account.userId, acc.userId), eq(account.provider, "google")));
  return data.access_token;
}
