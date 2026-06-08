"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  Megaphone,
  RefreshCw,
  Settings,
  BookOpen,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ShoppingBag,
  ClipboardList,
  Gift,
  type LucideIcon,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

interface NavChild {
  href: string;
  label: string;
  // Order/"action" pages get an icon + bolder label to stand out.
  icon?: LucideIcon;
  // Optional explicit list of path prefixes used for the active-state match.
  // Useful when one sidebar entry covers multiple sibling routes that don't
  // necessarily share a prefix — e.g. "Leads" stays highlighted on both
  // /leads and /messages (Next Steps), "Customers" on /customers and
  // /customers/brands. When unset, the active match falls back to `href`.
  matchPrefixes?: string[];
}

interface NavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  href?: string; // when set, the header is also a link to its own page
  children: NavChild[];
}

type NavItem = NavLeaf | NavGroup;

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Customer",
    icon: Users,
    children: [
      // Click target is the Leads list; active state also covers the Next
      // Steps tab which lives at /messages.
      { href: "/leads", label: "Leads", matchPrefixes: ["/leads", "/messages"] },
      // Click target is the B2B list; active state covers /customers (Consumer
      // list) and any /customers/* detail page too.
      { href: "/customers/brands", label: "Customers", matchPrefixes: ["/customers"] },
      // Click target is B2B (/invoices); active state also covers the
      // Consumer tab (/orders) so switching between Orders tabs keeps the
      // sidebar entry highlighted.
      {
        href: "/invoices",
        label: "Orders",
        icon: ShoppingBag,
        matchPrefixes: ["/invoices", "/orders"],
      },
    ],
  },
  {
    label: "Product",
    icon: Package,
    children: [
      // POs & Production absorbed the old standalone "Purchase Orders" and
      // "Production Summary" entries — Master grouping covers the PO list,
      // Sub-PO / SKU views cover in-flight production tracking.
      { href: "/modules/production", label: "POs & Production", icon: ClipboardList },
      { href: "/modules/production/suppliers", label: "Suppliers" },
      { href: "/products", label: "Products" },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    children: [
      { href: "/attribution", label: "Attribution" },
      { href: "/attribution/survey", label: "Self-report" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/funnel", label: "Funnel" },
      { href: "/funnel/strategy", label: "Funnel — Strategic" },
      { href: "/influencers", label: "Influencer List" },
      { href: "/influencer-tracking", label: "Influencer Orders", icon: Gift },
    ],
  },
  { href: "/data-sync", label: "Data Sync", icon: RefreshCw },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

const rowBase =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";
const activeCls = "bg-brand-hover text-white";
const idleCls = "text-zinc-400 hover:bg-brand-hover hover:text-white";

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

// Mobile drawer open state, shared between the hamburger button (in the header)
// and the drawer itself.
const SidebarContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close the drawer on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

function SidebarContent({
  logoUrl,
  onNavigate,
}: {
  logoUrl?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [notifCount, setNotifCount] = useState(0);
  const [pendingDrafts, setPendingDrafts] = useState(0);
  const [customerMsgs, setCustomerMsgs] = useState(0);
  const [supplierMsgs, setSupplierMsgs] = useState(0);
  const [influencerMsgs, setInfluencerMsgs] = useState(0);

  // Unread admin-notification badge. Stays in sync three ways: on navigation,
  // when a notification is marked read elsewhere (the notifications page
  // broadcasts "admin-notifications-changed"), and via a lightweight 60s poll
  // so it eventually reflects changes made on another device/by a teammate.
  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d) setNotifCount(d.count ?? 0);
        })
        .catch(() => {});
    };
    load();
    const poll = setInterval(load, 60_000);
    window.addEventListener("admin-notifications-changed", load);
    return () => {
      active = false;
      clearInterval(poll);
      window.removeEventListener("admin-notifications-changed", load);
    };
  }, [pathname]);

  // Pending follow-up drafts → blue dot on Leads (and its Customer group).
  useEffect(() => {
    let active = true;
    fetch("/api/leads/pending-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setPendingDrafts(d.count ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  // New (undismissed) customer messages → blue dot on the Customer group.
  // Polls every 60s (+ on navigation) like the notification badge.
  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/customer-messages/count")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d?.data) {
            setCustomerMsgs((d.data.b2b ?? 0) + (d.data.consumer ?? 0));
            setSupplierMsgs(d.data.supplier ?? 0);
            setInfluencerMsgs(d.data.influencer ?? 0);
          }
        })
        .catch(() => {});
    };
    load();
    const poll = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [pathname]);

  // Nav hrefs that should show a blue dot.
  const dotHrefs = new Set<string>();
  if (pendingDrafts > 0) dotHrefs.add("/leads");
  if (customerMsgs > 0) dotHrefs.add("/customers/brands");
  if (supplierMsgs > 0) dotHrefs.add("/modules/production/suppliers");
  if (influencerMsgs > 0) dotHrefs.add("/influencers");

  function toggle(label: string, fallback: boolean) {
    setOpen((o) => ({ ...o, [label]: !(o[label] ?? fallback) }));
  }

  return (
    <>
      <div className="flex h-16 items-center border-b border-brand-border px-6">
        <Link href="/dashboard" onClick={onNavigate}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl ?? "/images/fitwell-logo.png"}
            alt="Fitwell Admin"
            // Local brand asset is black on white; invert for this dark
            // sidebar. The Shopify-uploaded logo (when provided) renders
            // as-is — Shopify admins control its colors directly.
            className={cn(
              "h-[29px] w-auto",
              !logoUrl && "invert",
            )}
          />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          if (!isGroup(item)) {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(rowBase, isActive ? activeCls : idleCls)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.href === "/notifications" && notifCount > 0 && (
                  <span className="ml-auto rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {notifCount}
                  </span>
                )}
              </Link>
            );
          }

          // Children render alphabetically by label within their parent.
          // Display in the order declared in navItems (not alphabetical) so
          // each group's sequence is intentional.
          const children = item.children;
          // Active child = the longest matching prefix vs the current path.
          // A child's match scope is its `matchPrefixes` (any path under any
          // of them) if set, else just its href. Sorting by the longest
          // matched prefix length keeps a more-specific sibling winning over
          // a broader one when both match.
          const matchPath = (path: string) =>
            pathname === path || pathname.startsWith(`${path}/`);
          const longestMatch = (c: NavChild): number | null => {
            const scopes = c.matchPrefixes ?? [c.href];
            let longest = -1;
            for (const s of scopes) {
              if (matchPath(s) && s.length > longest) longest = s.length;
            }
            return longest >= 0 ? longest : null;
          };
          const activeChildHref =
            children
              .map((c) => ({ c, len: longestMatch(c) }))
              .filter((x): x is { c: NavChild; len: number } => x.len !== null)
              .sort((a, b) => b.len - a.len)[0]?.c.href ?? null;
          const childActive = activeChildHref !== null;
          const selfActive = item.href ? pathname.startsWith(item.href) : false;
          const expanded = open[item.label] ?? childActive;
          const groupHasDot = children.some((c) => dotHrefs.has(c.href));

          return (
            <div key={item.label}>
              {item.href ? (
                <div className="flex items-center">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(rowBase, "flex-1", selfActive ? activeCls : idleCls)}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(item.label, childActive)}
                    aria-label={`Toggle ${item.label}`}
                    aria-expanded={expanded}
                    className="ml-1 rounded-md p-2 text-zinc-400 transition-colors hover:bg-brand-hover hover:text-white"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        expanded ? "" : "-rotate-90",
                      )}
                    />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(item.label, childActive)}
                  aria-expanded={expanded}
                  className={cn(
                    rowBase,
                    "w-full justify-between",
                    childActive ? activeCls : idleCls,
                  )}
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {groupHasDot && (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      expanded ? "" : "-rotate-90",
                    )}
                  />
                </button>
              )}

              {expanded && (
                <div className="mt-1 space-y-1 pl-9">
                  {children.map((child) => {
                    const active = child.href === activeChildHref;
                    const ChildIcon = child.icon;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-brand-hover text-white"
                            : "text-zinc-400 hover:bg-brand-hover hover:text-white",
                        )}
                      >
                        {ChildIcon && (
                          <ChildIcon className="h-4 w-4 shrink-0" />
                        )}
                        <span className={ChildIcon ? "font-semibold" : undefined}>
                          {child.label}
                        </span>
                        {dotHrefs.has(child.href) && (
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-brand-border px-6 py-4">
        {session?.user?.email && (
          <p className="mb-3 truncate text-xs text-zinc-500">{session.user.email}</p>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-brand-hover hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  );
}

export function AdminSidebar({ logoUrl }: { logoUrl?: string }) {
  const { open, setOpen } = useContext(SidebarContext);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-brand-border bg-brand transition-transform duration-200 md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-5 text-zinc-400 hover:text-white"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent logoUrl={logoUrl} onNavigate={() => setOpen(false)} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-64 flex-col border-r border-brand-border bg-brand md:flex">
        <SidebarContent logoUrl={logoUrl} />
      </aside>
    </>
  );
}

export function MobileMenuButton() {
  const { setOpen } = useContext(SidebarContext);
  return (
    <button
      onClick={() => setOpen(true)}
      className="mr-2 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 md:hidden"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
