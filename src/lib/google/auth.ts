import { SignJWT, importPKCS8 } from "jose";

// Cache one token per scope SET, NOT one global token. Google issues a token
// scoped to exactly the scopes requested, so a single shared slot would hand
// (e.g.) the GA4 `analytics.readonly` token to the Google Ads caller, which the
// Ads API rejects with ACCESS_TOKEN_SCOPE_INSUFFICIENT. This bites whenever one
// warm (Fluid Compute) instance serves more than one extract cron in its
// lifetime. Key = the requested scopes, sorted so order doesn't matter.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = [...scopes].sort().join(" ");
  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.expiresAt - 60) {
    return cached.token;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Google service account credentials not configured");
  }

  // Unescape \n in env var
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKey, "RS256");

  const jwt = await new SignJWT({
    scope: scopes.join(" "),
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Google token exchange failed: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  });
  return data.access_token;
}
