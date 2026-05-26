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
  type LucideIcon,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

interface NavChild {
  href: string;
  label: string;
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
    label: "Customers",
    icon: Users,
    children: [
      { href: "/customers", label: "Consumer List" },
      { href: "/customers/brands", label: "B2B Brand List" },
      { href: "/invoices", label: "B2B Orders" },
      { href: "/orders", label: "Consumer Orders" },
    ],
  },
  {
    label: "Products",
    icon: Package,
    children: [
      { href: "/products", label: "Product List" },
      { href: "/modules/production", label: "Supplier POs" },
      { href: "/modules/production/summary", label: "Production Summary" },
      { href: "/modules/production/suppliers", label: "Supplier List" },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    children: [
      { href: "/attribution", label: "Attribution" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/funnel", label: "Funnel" },
      { href: "/influencers", label: "Influencer List" },
      { href: "/influencer-tracking", label: "Influencer Orders" },
    ],
  },
  { href: "/data-sync", label: "Data Sync", icon: RefreshCw },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

const rowBase =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";
const activeCls = "bg-zinc-800 text-white";
const idleCls = "text-zinc-400 hover:bg-zinc-800 hover:text-white";

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

  // Unread admin-notification badge; refetch on navigation.
  useEffect(() => {
    let active = true;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setNotifCount(d.count ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  function toggle(label: string, fallback: boolean) {
    setOpen((o) => ({ ...o, [label]: !(o[label] ?? fallback) }));
  }

  return (
    <>
      <div className="flex h-16 items-center border-b border-zinc-800 px-6">
        <Link href="/dashboard" onClick={onNavigate}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl ?? "/images/fitwell-logo.png"}
            alt="Fitwell Admin"
            className="h-[29px] w-auto"
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
          const children = [...item.children].sort((a, b) =>
            a.label.localeCompare(b.label),
          );
          // Active child = the longest href that prefixes the current path.
          const matchPath = (href: string) =>
            pathname === href || pathname.startsWith(`${href}/`);
          const activeChildHref =
            children
              .filter((c) => matchPath(c.href))
              .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
          const childActive = activeChildHref !== null;
          const selfActive = item.href ? pathname.startsWith(item.href) : false;
          const expanded = open[item.label] ?? childActive;

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
                    className="ml-1 rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
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
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-white",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 px-6 py-4">
        {session?.user?.email && (
          <p className="mb-3 truncate text-xs text-zinc-500">{session.user.email}</p>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-800 bg-zinc-900 transition-transform duration-200 md:hidden",
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
      <aside className="hidden h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-900 md:flex">
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
