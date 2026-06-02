// Pure helper (no db) so it's unit-testable apart from the sent-followups
// service. "Re:" the original subject (don't double-prefix); fall back to the
// AI-drafted subject when there's no original.
export function followupSubject(
  original: string | null | undefined,
  fallback: string,
): string {
  const s = (original ?? "").trim();
  if (!s) return fallback;
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}
