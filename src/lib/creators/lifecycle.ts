/**
 * Creator lifecycle (2026-06-12, Tom's design session): relationship
 * status is human judgment; logistics are derived facts. The pipeline
 * stage merges both — nobody hand-sets "evaluating", it's computed from
 * "sample delivered + no post yet".
 *
 * Relationship statuses: prospect → contacted → agreed → active
 * (+ burned / archived as exits).
 * Derived stages add the logistics overlay between agreed and active.
 */

export const PIPELINE_STAGES = [
  "prospect",
  "outreach",
  "agreed",
  "sample_sent",
  "evaluating",
  "posted",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  prospect: "Prospect",
  outreach: "Outreach",
  agreed: "Agreed",
  sample_sent: "Sample sent",
  evaluating: "Evaluating",
  posted: "Posted",
};

export interface LifecycleFacts {
  status: string;
  hasOutreach: boolean;
  /** Most advanced sample milestones across the creator's gifting orders. */
  sampleSentAt: Date | null;
  sampleDeliveredAt: Date | null;
  /** A detected/linked post that closes the loop (gift-linked or brand mention). */
  hasPost: boolean;
}

/**
 * The most advanced true stage wins. Burned/archived creators have no
 * pipeline stage (they're filtered out of pipeline views upstream).
 */
export function pipelineStage(facts: LifecycleFacts): PipelineStage | null {
  if (facts.status === "burned" || facts.status === "archived") return null;
  if (facts.hasPost) return "posted";
  if (facts.sampleDeliveredAt) return "evaluating";
  if (facts.sampleSentAt) return "sample_sent";
  if (facts.status === "agreed" || facts.status === "active") return "agreed";
  if (facts.hasOutreach || facts.status === "contacted") return "outreach";
  return "prospect";
}

// ─── Follow-up rules (outreach threads) ─────────────────────────────
// Status change → when to nudge next. Mirrors the original Phase 3 spec
// table; tweak freely, they're product knobs not invariants.

export const FOLLOWUP_RULES: Record<string, number | null> = {
  no_reply: 7, // sent, silence → try again in a week
  replied: 3, // conversation live → keep momentum
  negotiating: 3,
  agreed: null, // sample flow takes over from here
  declined: null,
  ghosted: null,
};

export const OUTREACH_STATUSES = [
  "no_reply",
  "replied",
  "negotiating",
  "agreed",
  "declined",
  "ghosted",
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_CHANNELS = [
  "email",
  "ig_dm",
  "yt_comment",
  "manager",
  "other",
] as const;

export function nextFollowupAt(
  status: string,
  from: Date = new Date(),
): Date | null {
  const days = FOLLOWUP_RULES[status];
  if (days == null) return null;
  return new Date(from.getTime() + days * 86_400_000);
}

/** Threads silent this long get auto-burned by the action cron. */
export const AUTO_BURN_AFTER_DAYS = 60;

// ─── Follow-up draft templates (action engine) ──────────────────────
// Deterministic v1 — no AI call, no auto-send. The cron attaches these to
// notifications; a human reads, edits, sends from their own mailbox.

export function sampleDeliveredDraft(creatorName: string): string {
  return (
    `Hey ${creatorName.split(" ")[0]},\n\n` +
    `Tracking shows the buckle landed — wanted to make sure it arrived in one piece ` +
    `and fits the watch you had in mind. If sizing's off or you want a different ` +
    `finish, say the word and we'll ship a swap.\n\n` +
    `No rush on content — happy to answer any questions about the mechanism while ` +
    `you're trying it out.\n\nTom`
  );
}

export function postOverdueNudgeDraft(
  creatorName: string,
  dueDate: string,
): string {
  return (
    `Hey ${creatorName.split(" ")[0]},\n\n` +
    `Checking in on the post we'd penciled in around ${dueDate} — totally fine if ` +
    `life got in the way, just let me know where it stands or if a new date works ` +
    `better.\n\nTom`
  );
}
