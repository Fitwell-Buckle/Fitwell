import { z } from "zod";

// Pure types + validation for the lead follow-up rule (no db import, so it's
// unit-testable). The db-backed getter/upserter live in ./followup-settings.

export const DEFAULT_NUDGE_AFTER_DAYS = 14;

export interface FollowupSettings {
  // Rule 1 — auto-draft an initial follow-up when a new lead is captured.
  initialDraftEnabled: boolean;
  // Rule 2 — follow up on an email you sent that got no reply in N days.
  enabled: boolean;
  nudgeAfterDays: number;
}

export const followupSettingsSchema = z.object({
  initialDraftEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  // Whole days; at least 1 (same-day re-nudging makes no sense) and capped so a
  // typo can't silently push follow-ups out by years.
  nudgeAfterDays: z.number().int().min(1).max(365).optional(),
});
export type FollowupSettingsInput = z.infer<typeof followupSettingsSchema>;
