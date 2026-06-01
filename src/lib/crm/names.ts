// Title-case a personal name: first letter of each name part uppercased,
// the rest lowercased. Handles the common shapes on business cards:
//   "PALMER"        → "Palmer"   (French/German all-caps surnames)
//   "fabien"        → "Fabien"
//   "jean-pierre"   → "Jean-Pierre"
//   "o'brien"       → "O'Brien"
//   "mary  jane"    → "Mary Jane" (collapses internal whitespace)
//   "renée"         → "Renée"     (accents preserved + cased)
//
// Word boundaries are start-of-string, whitespace, hyphen, and apostrophe.
// Note: this intentionally does NOT special-case "McDonald" / "MacLeod" —
// the rule is strictly capital-first-lowercase-rest, so those become
// "Mcdonald" / "Macleod". Add an exception list later if that bites.
export function toNameCase(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .replace(
      // first alpha (incl. Latin-1/extended accented) after start or a
      // word-boundary char
      /(^|[\s\-'])([a-zà-ɏ])/g,
      (_m, sep: string, ch: string) => sep + ch.toUpperCase(),
    );
}
