"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function PortalTopBar({
  logoUrl,
  companyName,
}: {
  logoUrl: string;
  companyName: string;
}) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/portal" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Fitwell" className="h-7 w-auto" />
          <span className="text-sm font-medium text-zinc-400">B2B portal</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/portal/orders" className="text-sm text-zinc-500 hover:text-zinc-900">
            Orders
          </Link>
          <span className="hidden text-sm text-zinc-600 sm:inline">{companyName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/portal/login" })}
            className="flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
