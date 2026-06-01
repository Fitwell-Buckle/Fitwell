// Parses common QR-code payloads found on business cards into the same field
// shape used by the lead form. Supports vCard 3.0/4.0, MeCard, mailto:,
// tel:, and plain URLs. Unknown payloads return null.

export interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyName: string | null;
  website: string | null;
}

const EMPTY: ParsedContact = {
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  title: null,
  companyName: null,
  website: null,
};

// Splits on the given delimiter while honoring vCard/MeCard's backslash
// escapes (e.g. "Smith\\,Jr" stays a single token).
function splitEscaped(s: string, delim: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      buf += s[i + 1];
      i++;
      continue;
    }
    if (ch === delim) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\([,;\\nN])/g, (_m, ch) =>
    ch === "n" || ch === "N" ? "\n" : ch,
  );
}

// Split "Lovelace Ada" / "Ada" / "Augusta Ada King-Noel" into first/last.
function splitName(full: string): { firstName: string | null; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) {
    return { firstName: null, lastName: null };
  }
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function parseVCard(text: string): ParsedContact {
  const out: ParsedContact = { ...EMPTY };
  // Unfold continuation lines (RFC 6350): a CRLF followed by a space/tab
  // belongs to the previous line.
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  for (const rawLine of unfolded.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    // Strip parameters: "EMAIL;TYPE=WORK" → "EMAIL"
    const name = left.split(";")[0].toUpperCase();

    switch (name) {
      case "FN": {
        if (!out.firstName && !out.lastName) {
          const split = splitName(unescape(value));
          out.firstName = split.firstName;
          out.lastName = split.lastName;
        }
        break;
      }
      case "N": {
        // N:Family;Given;Additional;Prefix;Suffix
        const parts = splitEscaped(value, ";").map(unescape);
        out.lastName = parts[0] || out.lastName;
        out.firstName = parts[1] || out.firstName;
        break;
      }
      case "EMAIL":
        out.email = out.email ?? unescape(value).trim();
        break;
      case "TEL":
        out.phone = out.phone ?? unescape(value).trim();
        break;
      case "ORG": {
        // ORG:Company;Department — first component is the org name
        const parts = splitEscaped(value, ";").map(unescape);
        out.companyName = out.companyName ?? (parts[0] || null);
        break;
      }
      case "TITLE":
        out.title = out.title ?? unescape(value).trim();
        break;
      case "URL":
        out.website = out.website ?? unescape(value).trim();
        break;
      default:
        break;
    }
  }
  return out;
}

function parseMeCard(text: string): ParsedContact {
  const out: ParsedContact = { ...EMPTY };
  const body = text.replace(/^MECARD:/i, "").replace(/;;?\s*$/, "");
  for (const segment of splitEscaped(body, ";")) {
    if (!segment) continue;
    const colon = segment.indexOf(":");
    if (colon < 0) continue;
    const name = segment.slice(0, colon).toUpperCase();
    const value = segment.slice(colon + 1);
    switch (name) {
      case "N": {
        // MeCard's N is "Last,First"
        const parts = splitEscaped(value, ",").map(unescape);
        out.lastName = parts[0] || out.lastName;
        out.firstName = parts[1] || out.firstName;
        break;
      }
      case "EMAIL":
        out.email = out.email ?? unescape(value).trim();
        break;
      case "TEL":
        out.phone = out.phone ?? unescape(value).trim();
        break;
      case "ORG":
        out.companyName = out.companyName ?? unescape(value).trim();
        break;
      case "TITLE":
        out.title = out.title ?? unescape(value).trim();
        break;
      case "URL":
        out.website = out.website ?? unescape(value).trim();
        break;
      default:
        break;
    }
  }
  return out;
}

// Parse any payload a QR scanner may decode on a business card. Returns
// null when the payload is unrecognized so the caller can surface "QR not
// understood — type it in" rather than blank-filling silently.
export function parseQrPayload(raw: string): ParsedContact | null {
  const text = raw.trim();
  if (!text) return null;

  if (/^BEGIN:VCARD/i.test(text)) return parseVCard(text);
  if (/^MECARD:/i.test(text)) return parseMeCard(text);

  if (/^mailto:/i.test(text)) {
    const addr = text.slice(7).split("?")[0].trim();
    return addr ? { ...EMPTY, email: addr } : null;
  }
  if (/^tel:/i.test(text)) {
    const num = text.slice(4).trim();
    return num ? { ...EMPTY, phone: num } : null;
  }
  if (/^https?:\/\//i.test(text)) return { ...EMPTY, website: text };

  // Naked email or phone? Cheap sniff.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { ...EMPTY, email: text };
  }

  return null;
}
