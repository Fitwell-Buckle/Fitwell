import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  NON_NAVIGABLE,
  applyBreadcrumbOverride,
  type Crumb,
} from "./breadcrumb-nav";

// Walk the admin App Router tree and collect every page route, with route-group
// dirs "(...)" collapsed (they don't add a URL segment) — mirroring how the
// breadcrumb derives its trail from the pathname.
function collectRoutes(): Set<string> {
  const routes = new Set<string>();
  const ROOT = "src/app/(admin)";
  function walk(dir: string, rel: string) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        const seg = entry.startsWith("(") && entry.endsWith(")") ? "" : `/${entry}`;
        walk(p, rel + seg);
      } else if (entry === "page.tsx") {
        routes.add(rel || "/");
      }
    }
  }
  walk(ROOT, "");
  return routes;
}

// Every intermediate breadcrumb path (a prefix of some route) that has no page
// of its own — i.e. a link to it would 404.
function deadPrefixes(routes: Set<string>): string[] {
  const dead = new Set<string>();
  for (const r of routes) {
    const segs = r.split("/").filter(Boolean);
    for (let i = 1; i < segs.length; i++) {
      const prefix = `/${segs.slice(0, i).join("/")}`;
      if (!routes.has(prefix)) dead.add(prefix);
    }
  }
  return [...dead].sort();
}

describe("breadcrumb dead-link coverage", () => {
  it("every page-less intermediate breadcrumb path is marked non-navigable", () => {
    const routes = collectRoutes();
    const uncovered = deadPrefixes(routes).filter((p) => !NON_NAVIGABLE.has(p));
    // If this fails, a breadcrumb links to a path with no page. Add it to
    // NON_NAVIGABLE (or create the page).
    expect(uncovered).toEqual([]);
  });

  it("does not mark a real page as non-navigable", () => {
    const routes = collectRoutes();
    const wrong = [...NON_NAVIGABLE].filter((p) => routes.has(p));
    expect(wrong).toEqual([]);
  });
});

describe("applyBreadcrumbOverride", () => {
  // Mirrors a sub-PO trail: …/po/<id> derived as POs › PO.
  const base: Crumb[] = [
    { label: "Production", href: "/modules/production", last: false },
    { label: "POs", href: "/modules/production/po", last: false },
    { label: "PO", href: "/modules/production/po/sub123", last: true },
  ];

  it("returns the crumbs unchanged when there's no override", () => {
    expect(applyBreadcrumbOverride(base, null)).toEqual(base);
    expect(applyBreadcrumbOverride(base, undefined)).toEqual(base);
    expect(applyBreadcrumbOverride(base, {})).toEqual(base);
  });

  it("relabels only the current (last) crumb", () => {
    const out = applyBreadcrumbOverride(base, { label: "PO-00104-B" });
    expect(out.map((c) => c.label)).toEqual(["Production", "POs", "PO-00104-B"]);
    // Earlier crumbs untouched.
    expect(out[1]).toEqual(base[1]);
  });

  it("inserts the master crumb just before the current one", () => {
    const out = applyBreadcrumbOverride(base, {
      label: "PO-00104-B",
      trail: [
        { label: "PO-00104-Master", href: "/modules/production/po/master1" },
      ],
    });
    expect(out.map((c) => c.label)).toEqual([
      "Production",
      "POs",
      "PO-00104-Master",
      "PO-00104-B",
    ]);
    // The inserted master crumb is navigable; the sub-PO stays current.
    const master = out[2];
    expect(master).toEqual({
      label: "PO-00104-Master",
      href: "/modules/production/po/master1",
      last: false,
    });
    expect(out[out.length - 1].last).toBe(true);
  });

  it("is a no-op on an empty crumb list", () => {
    expect(applyBreadcrumbOverride([], { label: "x" })).toEqual([]);
  });
});
