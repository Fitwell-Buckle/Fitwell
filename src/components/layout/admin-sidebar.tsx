"use client";

import { useState } from "react";
import Image from "next/image";
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
  LogOut,
  ChevronDown,
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
      { href: "/customers", label: "Consumers" },
      { href: "/customers/companies", label: "Companies" },
      { href: "/orders", label: "Orders" },
    ],
  },
  {
    label: "Products",
    icon: Package,
    children: [
      { href: "/products", label: "Product List" },
      { href: "/modules/production", label: "POs and Production" },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    children: [
      { href: "/attribution", label: "Attribution" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/funnel", label: "Funnel" },
    ],
  },
  { href: "/data-sync", label: "Data Sync", icon: RefreshCw },
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

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function toggle(label: string, fallback: boolean) {
    setOpen((o) => ({ ...o, [label]: !(o[label] ?? fallback) }));
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex h-16 items-center border-b border-zinc-800 px-6">
        <Link href="/dashboard">
          <Image
            src="/images/fitwell-logo.png"
            alt="Fitwell Admin"
            width={120}
            height={29}
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
                className={cn(rowBase, isActive ? activeCls : idleCls)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          }

          // Children render alphabetically by label within their parent.
          const children = [...item.children].sort((a, b) =>
            a.label.localeCompare(b.label),
          );
          // Active child = the longest href that prefixes the current path, so
          // a nested route (/customers/companies) doesn't also light up its
          // parent-list sibling (/customers).
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
          <p className="mb-3 truncate text-xs text-zinc-500">
            {session.user.email}
          </p>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
