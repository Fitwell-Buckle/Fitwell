// Pure Gmail-query builder (no db imports, so it's unit-testable). Uses Gmail's
// epoch-seconds form of `after:` (not YYYY/MM/DD) so "since" is precise to the
// second — critical for dedup: a reply already notified at time T must NOT
// re-match on the next run, which day-granularity would (re-firing all day).
export function buildReplyQuery(fromEmail: string, since: Date): string {
  const epochSeconds = Math.max(0, Math.floor(since.getTime() / 1000));
  return `from:${fromEmail} after:${epochSeconds}`;
}

// Pure builder for the "Sent" direction: messages WE sent to the contact. Scoped
// to the Sent mailbox (`in:sent`) and addressed to the contact, so it mirrors
// `from:` for received without dragging in unrelated mail the contact is merely
// cc'd on elsewhere. Kept here (no db imports) so it's unit-testable.
export function buildSentQuery(toEmail: string): string {
  return `in:sent to:${toEmail}`;
}
