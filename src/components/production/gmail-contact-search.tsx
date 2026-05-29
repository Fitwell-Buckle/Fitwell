"use client";

import { useState } from "react";
import { Mail, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface GmailContactMatch {
  email: string;
  name: string | null;
  snippet: string;
}

/**
 * Reusable Gmail-search affordance for any form that adds a contact email.
 * Hits /api/gmail/search?q=… (admin-only, uses the signed-in admin's stored
 * Google OAuth token). Calls `onPick` with the chosen match — the parent
 * decides what to fill (email-only field vs. email + name fields).
 *
 * Renders a compact label + input + button + results list. Self-clears the
 * results after a pick.
 */
export function GmailContactSearch({
  onPick,
  label = "Search your Gmail",
  placeholder = "Supplier name, domain, or anything you'd search Gmail for",
  className,
}: {
  onPick: (match: GmailContactMatch) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<GmailContactMatch[] | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setError(null);
    setMatches(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/gmail/search?q=${encodeURIComponent(q)}`);
      const d = (await res.json().catch(() => ({}))) as {
        data?: GmailContactMatch[];
        error?: string;
      };
      if (!res.ok) {
        setError(d.error || "Gmail search failed.");
        return;
      }
      setMatches(d.data ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
        <Mail className="h-3 w-3" /> {label}
      </div>
      <div className="flex gap-2">
        <Input
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button
          variant="outline"
          onClick={() => void search()}
          disabled={busy || !query.trim()}
        >
          <Search className="h-4 w-4" />
          {busy ? "Searching…" : "Search"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {matches && matches.length === 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          No emails found in messages matching that query.
        </p>
      )}
      {matches && matches.length > 0 && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {matches.map((m) => (
            <li key={m.email}>
              <button
                type="button"
                className="w-full rounded-md border border-zinc-100 px-3 py-1.5 text-left text-sm text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50"
                onClick={() => {
                  onPick(m);
                  setMatches(null);
                  setQuery("");
                }}
              >
                <span className="font-medium text-zinc-900">{m.email}</span>
                {m.name && (
                  <span className="ml-2 text-xs text-zinc-500">{m.name}</span>
                )}
                {m.snippet && (
                  <div className="truncate text-xs text-zinc-400">
                    {m.snippet}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
