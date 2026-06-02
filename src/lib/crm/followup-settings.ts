import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leadFollowupSettings } from "@/lib/schema";
import {
  DEFAULT_NUDGE_AFTER_DAYS,
  type FollowupSettings,
  type FollowupSettingsInput,
} from "./followup-settings-schema";

// Single global lead follow-up rule, persisted in `lead_followup_settings`
// (one row, id="default") and edited in admin Settings. Drives the daily nudge
// cron. A general, multi-rule + AI-assisted engine is planned separately — see
// specs/work-plans/todo/lead-followup-rule-engine.md.

// Re-export the pure schema/types so callers have a single import surface.
export {
  DEFAULT_NUDGE_AFTER_DAYS,
  followupSettingsSchema,
  type FollowupSettings,
  type FollowupSettingsInput,
} from "./followup-settings-schema";

// Current settings, falling back to the built-in defaults when no row exists
// yet (fresh DB / before first save).
export async function getFollowupSettings(): Promise<FollowupSettings> {
  const row = await db.query.leadFollowupSettings.findFirst({
    where: eq(leadFollowupSettings.id, "default"),
  });
  return {
    initialDraftEnabled: row?.initialDraftEnabled ?? true,
    enabled: row?.enabled ?? true,
    nudgeAfterDays: row?.nudgeAfterDays ?? DEFAULT_NUDGE_AFTER_DAYS,
  };
}

export async function upsertFollowupSettings(
  input: FollowupSettingsInput,
): Promise<void> {
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.initialDraftEnabled !== undefined)
    fields.initialDraftEnabled = input.initialDraftEnabled;
  if (input.enabled !== undefined) fields.enabled = input.enabled;
  if (input.nudgeAfterDays !== undefined)
    fields.nudgeAfterDays = input.nudgeAfterDays;
  // Nothing to change beyond the timestamp — no-op.
  if (Object.keys(fields).length === 1) return;

  await db
    .insert(leadFollowupSettings)
    .values({
      id: "default",
      initialDraftEnabled: input.initialDraftEnabled ?? true,
      enabled: input.enabled ?? true,
      nudgeAfterDays: input.nudgeAfterDays ?? DEFAULT_NUDGE_AFTER_DAYS,
    })
    .onConflictDoUpdate({ target: leadFollowupSettings.id, set: fields });
}
