/**
 * Breadcrumb path prefixes that are URL groupings WITHOUT their own page — a
 * link to them 404s, so the breadcrumb renders them as plain (non-clickable)
 * labels instead. The parent crumb still links somewhere useful (e.g. on a PO,
 * "Production" → the PO list at /modules/production).
 *
 * Kept exhaustive by `breadcrumb-nav.test.ts`, which walks the actual route tree
 * and fails if any intermediate breadcrumb path lacks both a page and an entry
 * here (or vice-versa).
 */
export const NON_NAVIGABLE: ReadonlySet<string> = new Set([
  // The PO list lives at /modules/production; there is no /modules/production/po page.
  "/modules/production/po",
  // Docs sub-sections are containers with only [slug] children (no index page).
  "/docs/invariants",
  "/docs/strategy",
]);
