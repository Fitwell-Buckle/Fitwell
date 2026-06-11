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

export interface BreadcrumbCrumb {
  label: string;
  href: string;
}

/**
 * A page-supplied override of the auto-derived trail. `label` replaces the
 * current (last) crumb's label — e.g. a real PO number instead of the generic
 * "PO". `trail` inserts ancestor crumbs immediately before the current one —
 * e.g. a sub-PO's master, so the trail reads POs › master › sub-PO.
 */
export interface BreadcrumbOverride {
  label?: string;
  trail?: BreadcrumbCrumb[];
}

export interface Crumb extends BreadcrumbCrumb {
  last: boolean;
}

/** Apply a page override to the auto-derived crumbs. Pure so it's unit-tested
 *  independently of the React component. */
export function applyBreadcrumbOverride(
  crumbs: Crumb[],
  override: BreadcrumbOverride | null | undefined,
): Crumb[] {
  if (!override || crumbs.length === 0) return crumbs;
  let result = crumbs;
  if (override.label) {
    result = result.map((c, i) =>
      i === result.length - 1 ? { ...c, label: override.label as string } : c,
    );
  }
  if (override.trail?.length) {
    const last = result[result.length - 1];
    result = [
      ...result.slice(0, -1),
      ...override.trail.map((t) => ({ label: t.label, href: t.href, last: false })),
      last,
    ];
  }
  return result;
}
