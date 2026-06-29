import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPair, exportPKCS8 } from "jose";

// getGoogleAccessToken keeps a module-level cache, so each test imports the
// module fresh (vi.resetModules) to start with an empty cache.
async function freshModule() {
  vi.resetModules();
  return import("./auth");
}

let fetchCalls: number;

beforeEach(async () => {
  // A real RSA key so the production importPKCS8/SignJWT path runs unchanged.
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@fitwell.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = await exportPKCS8(privateKey);

  // Each token exchange returns a distinct token so we can tell a cache hit
  // (same token, no new fetch) from a fresh fetch.
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: `token-${++fetchCalls}`, expires_in: 3600 }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const GA4 = ["https://www.googleapis.com/auth/analytics.readonly"];
const ADS = ["https://www.googleapis.com/auth/adwords"];

describe("getGoogleAccessToken scope-keyed cache", () => {
  it("reuses the cached token for the same scope set", async () => {
    const { getGoogleAccessToken } = await freshModule();
    const a = await getGoogleAccessToken(GA4);
    const b = await getGoogleAccessToken(GA4);
    expect(a).toBe(b);
    expect(fetchCalls).toBe(1); // second call served from cache
  });

  it("does NOT serve one scope's token to a different scope", async () => {
    const { getGoogleAccessToken } = await freshModule();
    const ga4Token = await getGoogleAccessToken(GA4);
    const adsToken = await getGoogleAccessToken(ADS);
    // The regression: Ads used to receive the GA4 token (ACCESS_TOKEN_SCOPE_INSUFFICIENT).
    expect(adsToken).not.toBe(ga4Token);
    expect(fetchCalls).toBe(2); // a separate exchange per scope set
  });

  it("treats scope order as the same cache key", async () => {
    const { getGoogleAccessToken } = await freshModule();
    const two = ["b-scope", "a-scope"];
    const twoReordered = ["a-scope", "b-scope"];
    const first = await getGoogleAccessToken(two);
    const second = await getGoogleAccessToken(twoReordered);
    expect(first).toBe(second);
    expect(fetchCalls).toBe(1);
  });
});
