"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

// Display labels for known path segments. Anything not here falls back to a
// title-cased slug, and id-looking segments use the parent's singular noun.
const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  customers: "Customers",
  brands: "B2B Customers",
  companies: "Companies",
  leads: "Leads",
  capture: "Capture",
  new: "New",
  orders: "Orders",
  invoices: "Invoices",
  campaigns: "Campaigns",
  attribution: "Attribution",
  funnel: "Funnel",
  strategy: "Strategy",
  influencers: "Influencers",
  "influencer-tracking": "Influencer Tracking",
  products: "Products",
  inventory: "Inventory",
  modules: "Modules",
  production: "Production",
  po: "Purchase Orders",
  suppliers: "Suppliers",
  kanban: "Kanban",
  summary: "Summary",
  settings: "Settings",
  messages: "Next Steps",
  notifications: "Notifications",
  docs: "Docs",
  print: "Print",
  send: "Send",
  edit: "Edit",
};

// Singular noun for a detail page, keyed by its parent segment.
const ID_SINGULAR: Record<string, string> = {
  leads: "Lead",
  brands: "Customer",
  customers: "Customer",
  companies: "Company",
  invoices: "Invoice",
  po: "PO",
  suppliers: "Supplier",
  influencers: "Influencer",
  "influencer-tracking": "Tracking link",
};

function isIdSegment(seg: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f-]+$/i.test(seg) || // uuid
    /^\d+$/.test(seg) || // numeric id
    /^[0-9a-f]{24,}$/i.test(seg) // long hex/cuid
  );
}

function labelFor(seg: string, parent: string | null): string {
  if (LABELS[seg]) return LABELS[seg];
  if (isIdSegment(seg)) return (parent && ID_SINGULAR[parent]) || "Detail";
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Auto breadcrumb trail derived from the URL, rendered on every admin page (in
// the layout). Replaces the ad-hoc per-page "Back" buttons. Hidden on the
// dashboard root and when printing.
export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Nothing useful to show at the dashboard root.
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) {
    return null;
  }

  const crumbs = segments.map((seg, i) => ({
    label: labelFor(seg, i > 0 ? segments[i - 1] : null),
    href: "/" + segments.slice(0, i + 1).join("/"),
    last: i === segments.length - 1,
  }));

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex items-center gap-1 text-sm text-zinc-400 print:hidden"
    >
      <Link href="/dashboard" className="hover:text-zinc-700">
        Home
      </Link>
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
          {c.last ? (
            <span className="font-medium text-zinc-600">{c.label}</span>
          ) : (
            <Link href={c.href} className="hover:text-zinc-700">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
