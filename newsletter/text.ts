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
