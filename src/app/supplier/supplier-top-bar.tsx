"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bell, CircleHelp, LogOut } from "lucide-react";

export function SupplierTopBar({
  supplierName,
}: {
  supplierName: string;
}) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Unread notification badge; refetch on navigation.
  useEffect(() => {
    let active = true;
    fetch("/api/supplier/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setUnread(d.count ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  return (
    <header className="border-b border-zinc-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/supplier" className="flex items-center gap-3">
          {/* The bundled wordmark is white (built for the dark admin header);
           *  brightness-0 renders it black on this light supplier header. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/fitwell-logo.png"
            alt="Fitwell"
            className="h-7 w-auto brightness-0"
          />
          <span className="text-sm font-medium text-zinc-400">Supplier portal</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-zinc-600 sm:inline">{supplierName}</span>
          <Link
            href="/supplier/help"
            aria-label="Help & guides"
            className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <CircleHelp className="h-5 w-5" />
            <span className="hidden sm:inline">Help</span>
          </Link>
          <Link
            href="/supplier/notifications"
            aria-label="Notifications"
            className="relative text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unread}
              </span>
            )}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/supplier/login" })}
            className="flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
