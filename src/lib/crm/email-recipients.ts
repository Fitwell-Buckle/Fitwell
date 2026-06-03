// Pure helpers for the comma/semicolon-separated Cc / Bcc recipient lists on
// outbound messages. Shared by the API validation (zod refine), the service
// (normalized for storage in outbound_message.{cc,bcc}), and the Gmail send
// path (Cc:/Bcc: headers). No DB / IO so it's unit-testable in isolation.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Split a raw "a@x.com, b@y.com; c@z.com" string into trimmed, non-empty parts.
// Accepts comma or semicolon separators (people paste either).
export function splitRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// The addresses in `raw` that aren't valid email syntax — drives a clear
// validation message ("these aren't valid: …").
export function invalidRecipients(raw: string | null | undefined): string[] {
  return splitRecipients(raw).filter((s) => !EMAIL_RE.test(s));
}

// True when every address present is syntactically valid. An empty / blank list
// is valid (Cc/Bcc are optional).
export function isValidRecipientList(raw: string | null | undefined): boolean {
  return invalidRecipients(raw).length === 0;
}

// Normalize for storage and headers: de-duplicate case-insensitively (keeping
// the first spelling), comma-join. Returns null when nothing's left, so an
// emptied box clears the stored field.
export function normalizeRecipients(
  raw: string | null | undefined,
): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of splitRecipients(raw)) {
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out.length > 0 ? out.join(", ") : null;
}
