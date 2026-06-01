// Pure Gmail-query builder (no db imports, so it's unit-testable). Uses Gmail's
// epoch-seconds form of `after:` (not YYYY/MM/DD) so "since" is precise to the
// second — critical for dedup: a reply already notified at time T must NOT
// re-match on the next run, which day-granularity would (re-firing all day).
export function buildReplyQuery(fromEmail: string, since: Date): string {
  const epochSeconds = Math.max(0, Math.floor(since.getTime() / 1000));
  return `from:${fromEmail} after:${epochSeconds}`;
}
