/**
 * Parses an RFC-5322-ish header value (`From`, `To`, `Cc`) into a list of
 * `{name, email}`. Handles `"Name" <email>`, `Name <email>`, and bare emails;
 * accepts multiple addresses comma-separated.
 *
 * Standalone (no `db` import) so the parser is testable without an env.
 */
export function parseAddressList(
  raw: string,
): Array<{ email: string; name: string | null }> {
  const out: Array<{ email: string; name: string | null }> = [];
  const parts = splitAddresses(raw);
  for (const part of parts) {
    const m = part.match(/^\s*(?:"?([^"<]*?)"?\s+)?<?([^\s<>]+@[^\s<>]+?)>?\s*$/);
    if (!m) continue;
    const name = m[1]?.trim() || null;
    const email = m[2].trim();
    if (email) out.push({ email, name });
  }
  return out;
}

/**
 * Split a header value on commas that aren't inside a quoted string.
 * `"Last, First" <a@x>, b@x` → ['"Last, First" <a@x>', ' b@x'].
 */
function splitAddresses(s: string): string[] {
  const parts: string[] = [];
  let inQuotes = false;
  let buf = "";
  for (const ch of s) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "," && !inQuotes) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}
