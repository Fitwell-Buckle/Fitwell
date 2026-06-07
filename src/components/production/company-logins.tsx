"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GmailContactMatch } from "./gmail-contact-search";

export interface CompanyLogin {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Portal-login allowlist for a B2B company. Adds / removes magic-link signin
 * emails for the brand. The same input feeds either flow: type a known email
 * and hit Add, or type a search term and hit Search Gmail — picking a match
 * populates the input so the next click is Add. Shared between the brands
 * manager and the customer detail page.
 */
export function CompanyLogins({
  companyId,
  contacts,
  // When embedded inside another card (e.g. the customer-details tabs), render
  // bare — no surrounding Card or heading (the tab already labels it).
  embedded = false,
}: {
  companyId: string;
  contacts: CompanyLogin[];
  embedded?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<GmailContactMatch[] | null>(null);

  // Loose email shape — only used to gate the Add button; the API rejects
  // anything malformed server-side, so false negatives here aren't dangerous.
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  async function add() {
    const e = value.trim().toLowerCase();
    if (!e) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/production/companies/${companyId}/contacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: e }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to add.");
      } else {
        setValue("");
        setMatches(null);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function searchGmail() {
    const q = value.trim();
    if (!q) return;
    setError(null);
    setMatches(null);
    setSearching(true);
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
      setSearching(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/company-contacts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to remove.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <>
      {!embedded && (
        <h2 className="text-sm font-semibold text-zinc-900">
          Additional B2B portal logins
        </h2>
      )}
      <p className="mt-1 text-xs text-zinc-500">
        The brand&apos;s contact email above is granted access automatically.
        Add anyone else on this list who should also sign in (magic link) to
        the B2B portal and order at this brand&apos;s pricing.
      </p>
      <div className="mt-3 space-y-2">
        {contacts.length === 0 ? (
          <p className="text-sm text-zinc-400">No logins yet.</p>
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-1.5"
            >
              <span className="text-sm text-zinc-700">{c.email}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => remove(c.id)}
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          type="text"
          placeholder="buyer@company.com — or a name / domain to search Gmail"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (looksLikeEmail) void add();
            else if (value.trim()) void searchGmail();
          }}
        />
        <Button
          variant="outline"
          onClick={() => void searchGmail()}
          disabled={searching || !value.trim()}
          title="Search your Gmail messages for this name or domain to find their email"
        >
          {searching ? (
            <>
              <Search className="h-4 w-4" />
              Searching…
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" />
              Search Gmail
            </>
          )}
        </Button>
        <Button onClick={() => void add()} disabled={busy || !looksLikeEmail}>
          Add
        </Button>
      </div>

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
                  setValue(m.email);
                  setMatches(null);
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );

  return embedded ? <div>{body}</div> : <Card className="p-6">{body}</Card>;
}
