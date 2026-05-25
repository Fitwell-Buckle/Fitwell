// Pure validation for editing a stage event's transition date. A stage's
// "entered" moment must stay between its neighbours in the timeline: not before
// the previous stage entered, and not after the next stage entered. Times are
// compared in epoch ms. DB-free so the rule is unit-tested directly.

export type StageDateCheck = { ok: true } | { ok: false; error: string };

export function validateStageEventDate(p: {
  newEnteredMs: number;
  /** Previous stage's entered_at (ms), or null if this is the first stage. */
  prevEnteredMs: number | null;
  /** Next stage's entered_at (ms), or null if this is the latest stage. */
  nextEnteredMs: number | null;
}): StageDateCheck {
  if (p.prevEnteredMs !== null && p.newEnteredMs < p.prevEnteredMs) {
    return { ok: false, error: "Date can't be before the previous stage." };
  }
  if (p.nextEnteredMs !== null && p.newEnteredMs > p.nextEnteredMs) {
    return { ok: false, error: "Date can't be after the next stage." };
  }
  return { ok: true };
}

/** A YYYY-MM-DD date at noon UTC — day-granularity, drift-free across timezones. */
export function dateToNoonUtc(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}
