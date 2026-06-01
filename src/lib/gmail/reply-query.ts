// Pure Gmail-query builder (no db imports, so it's unit-testable). Gmail's
// `after:` operator takes a YYYY/MM/DD date (account-local).
export function buildReplyQuery(fromEmail: string, since: Date): string {
  const y = since.getFullYear();
  const m = String(since.getMonth() + 1).padStart(2, "0");
  const d = String(since.getDate()).padStart(2, "0");
  return `from:${fromEmail} after:${y}/${m}/${d}`;
}
