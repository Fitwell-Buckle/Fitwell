/**
 * Public creator self-registration — pure validation + normalization for the
 * unauthenticated signup form at /creator-signup. An influencer fills in their
 * name + one or more social profiles and lands in the /creators pipeline as an
 * UNREVIEWED prospect for the team to vet. No admin data entry required.
 *
 * Kept db-free (like list.ts / edit.ts) so it stays unit-testable without a
 * database; the actual insert lives in the API route. Records are tagged
 * `source: "self_registration"` (creator.source) + `dataSource:
 * "self_registration"` (creator_platform) so the review queue can isolate
 * them. They are NOT auto-approved — vettingStatus stays "unreviewed".
 */

import { z } from "zod";
import { normalizeHandle } from "./scoring";

// Platforms an influencer can self-declare. ig/yt/tt are the first-class
// tracked platforms (the scoring crons poll these); the rest are stored as
// contact info only. Codes match creator_platform.platform conventions.
export const SIGNUP_PLATFORMS = [
  { value: "ig", label: "Instagram" },
  { value: "tt", label: "TikTok" },
  { value: "yt", label: "YouTube" },
  { value: "x", label: "X / Twitter" },
  { value: "fb", label: "Facebook" },
  { value: "other", label: "Other" },
] as const;

export const SIGNUP_PLATFORM_VALUES = SIGNUP_PLATFORMS.map((p) => p.value) as [
  string,
  ...string[]
];

const PLATFORM_LABEL = new Map<string, string>(
  SIGNUP_PLATFORMS.map((p) => [p.value, p.label]),
);

/** Human label for a stored platform value. Custom ("other") platforms are
 *  stored as the name the creator typed, so fall back to that verbatim. */
export function signupPlatformLabel(platform: string): string {
  return PLATFORM_LABEL.get(platform) ?? platform;
}

const profileSchema = z
  .object({
    platform: z.enum(SIGNUP_PLATFORM_VALUES),
    // Both required only when platform === "other": the name of the platform
    // (e.g. "Twitch") — stored as the platform value — and its domain (e.g.
    // "twitch.tv"), used to build a clickable profile URL.
    platformName: z.string().trim().max(50).nullish(),
    platformDomain: z.string().trim().max(200).nullish(),
    handle: z.string().trim().min(1, "handle is required").max(200),
    profileUrl: z.string().url().max(2000).nullish().or(z.literal("")),
  })
  .refine((p) => p.platform !== "other" || !!p.platformName?.trim(), {
    message: "Name the platform when you pick Other.",
    path: ["platformName"],
  })
  .refine((p) => p.platform !== "other" || !!normalizeDomain(p.platformDomain), {
    message: "Enter the platform's domain (e.g. twitch.tv) when you pick Other.",
    path: ["platformDomain"],
  });

/** Resolve the stored platform value: the code for known platforms, or the
 *  typed name (lowercased) for "other". Falls back to "other" if somehow blank. */
function resolvePlatform(platform: string, platformName?: string | null): string {
  if (platform !== "other") return platform;
  return (platformName ?? "").trim().toLowerCase().slice(0, 50) || "other";
}

/** Strip protocol / www / path / trailing slash → a bare host like "twitch.tv".
 *  Returns "" when nothing host-like remains. */
export function normalizeDomain(raw?: string | null): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

export const creatorSignupSchema = z
  .object({
    name: z.string().trim().min(1, "Please enter your name.").max(200),
    email: z.string().trim().email().max(200).nullish().or(z.literal("")),
    // Phone / WhatsApp. Free-form (international formats vary too much to
    // validate strictly); we just require a non-empty contact method.
    phone: z.string().trim().max(50).nullish(),
    // At least one social profile is required — that's the whole point.
    profiles: z.array(profileSchema).min(1, "Add at least one social profile.").max(8),
    notes: z.string().trim().max(5000).nullish(),
    // Honeypot: hidden field real users never fill. The route silently drops
    // submissions where this is non-empty (returns success, writes nothing) —
    // so a bot can't tell it was caught. Kept lax here so the route owns that.
    website: z.string().max(200).optional(),
  })
  // A creator must be reachable: require an email OR a phone (or both).
  .refine((d) => !!d.email?.trim() || !!d.phone?.trim(), {
    message: "Enter an email or a phone / WhatsApp number.",
    path: ["email"],
  });

export type CreatorSignupInput = z.infer<typeof creatorSignupSchema>;

export interface NormalizedProfile {
  platform: string;
  handle: string;
  profileUrl: string | null;
}

/**
 * Normalize + dedupe submitted profiles: lowercase/strip handles and collapse
 * duplicate (platform, handle) pairs (first occurrence wins). Pure — unit
 * tested without a DB.
 */
export function normalizeSignupProfiles(
  profiles: CreatorSignupInput["profiles"],
): NormalizedProfile[] {
  const seen = new Set<string>();
  const out: NormalizedProfile[] = [];
  for (const p of profiles) {
    const handle = normalizeHandle(p.handle);
    if (!handle) continue;
    const platform = resolvePlatform(p.platform, p.platformName);
    const key = `${platform}:${handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // For "other", build a clickable profile URL from the supplied domain
    // (e.g. twitch.tv/streamer) unless the creator already gave a full URL.
    const domain = p.platform === "other" ? normalizeDomain(p.platformDomain) : "";
    const profileUrl =
      p.profileUrl || (domain ? `https://${domain}/${handle}` : null);
    out.push({ platform, handle, profileUrl });
  }
  return out;
}
