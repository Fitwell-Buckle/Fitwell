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

const profileSchema = z.object({
  platform: z.enum(SIGNUP_PLATFORM_VALUES),
  handle: z.string().trim().min(1, "handle is required").max(200),
  profileUrl: z.string().url().max(2000).nullish().or(z.literal("")),
});

export const creatorSignupSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(200),
  email: z.string().trim().email().max(200).nullish().or(z.literal("")),
  // At least one social profile is required — that's the whole point.
  profiles: z.array(profileSchema).min(1, "Add at least one social profile.").max(8),
  notes: z.string().trim().max(5000).nullish(),
  // Honeypot: hidden field real users never fill. The route silently drops
  // submissions where this is non-empty (returns success, writes nothing) —
  // so a bot can't tell it was caught. Kept lax here so the route owns that.
  website: z.string().max(200).optional(),
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
    const key = `${p.platform}:${handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform: p.platform, handle, profileUrl: p.profileUrl || null });
  }
  return out;
}
