/**
 * Shared HTML-entity decoding for ingested text (titles, excerpts,
 * article bodies). Sources hand us entity-encoded text; we decode to
 * clean Unicode at ingestion so the MJML escaper (which encodes `&`)
 * doesn't double-encode `&ldquo;` → `&amp;ldquo;` and render it raw.
 */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  middot: "·",
  bull: "•",
  deg: "°",
  trade: "™",
  reg: "®",
  copy: "©",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  iuml: "ï",
  ntilde: "ñ",
  oslash: "ø",
  aring: "å",
  szlig: "ß",
};

/** Decode named + numeric (decimal & hex) HTML entities. Single pass. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED[body.toLowerCase()];
    return named ?? match;
  });
}

/** Decode entities, strip tags, and collapse whitespace. */
export function toPlainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Editorial prefixes outlets bolt onto headlines (case-insensitive),
 * stripped for display so headlines read as ours, not the source's.
 * Only matched when followed by a `:` / dash separator, so legitimate
 * title words ("New CEO at Rolex") are never touched.
 */
const HEADLINE_PREFIXES = [
  "Business News",
  "Industry News",
  "Introducing",
  "First Look",
  "Hands-On",
  "Hands On",
  "New Release",
  "New",
  "Photo Report",
  "In Photos",
  "Watch Spotting",
  "Recommended Reading",
  "Review",
  "Exclusive",
  "Breaking",
  "Editorial",
  "Opinion",
  "Just Because",
];

// Longest-first so "New Release" wins over "New"; separators: colon, en/em
// dash, or spaced hyphen.
const HEADLINE_PREFIX_RE = new RegExp(
  `^\\s*(?:${[...HEADLINE_PREFIXES]
    .sort((a, b) => b.length - a.length)
    .join("|")})\\s*(?::|\\u2013|\\u2014|\\s-)\\s+`,
  "i",
);

// No-colon variant: "Introducing the Autodromo…" / "First Look at the…".
// Only for these two prefixes, and only before an article/preposition, so
// we strip the prefix word but keep the rest of the sentence intact.
const HEADLINE_LEADIN_RE =
  /^\s*(?:Introducing|First Look(?:\s+at)?)\s+(?=(?:the|a|an|this)\s)/i;

/** Strip a leading editorial prefix from a headline (display only). */
export function cleanHeadline(title: string): string {
  let stripped = title.replace(HEADLINE_PREFIX_RE, "").trim();
  if (stripped === title.trim()) {
    stripped = title.replace(HEADLINE_LEADIN_RE, "").trim();
  }
  if (!stripped) return title.trim(); // never blank the headline
  // Re-capitalize if the strip left a lowercase first letter.
  return stripped[0].toLowerCase() === stripped[0] && /[a-z]/.test(stripped[0])
    ? stripped[0].toUpperCase() + stripped.slice(1)
    : stripped;
}
