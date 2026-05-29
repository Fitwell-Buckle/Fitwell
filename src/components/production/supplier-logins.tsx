"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SupplierLogin {
  id: string;
  email: string;
  name: string | null;
}

interface GmailMatch {
  email: string;
  name: string | null;
  snippet: string;
}

/**
 * Authorized-logins allowlist for a supplier. Adds / removes magic-link
 * signin emails. Shared between the supplier list manager and the new
 * supplier detail page.
 */
export function SupplierLogins({
  supplierId,
  contacts,
}: {
  supplierId: string;
  contacts: SupplierLogin[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gmail search: pulls candidate contact emails from the signed-in admin's
  // mailbox so an exact address doesn't have to be remembered or copy-pasted.
  const [gmailQuery, setGmailQuery] = useState("");
  const [gmailMatches, setGmailMatches] = useState<GmailMatch[] | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);

  async function searchGmail() {
    const q = gmailQuery.trim();
    if (!q) return;
    setGmailError(null);
    setGmailMatches(null);
    setGmailBusy(true);
    try {
      const res = await fetch(`/api/gmail/search?q=${encodeURIComponent(q)}`);
      const d = (await res.json().catch(() => ({}))) as {
        data?: GmailMatch[];
        error?: string;
      };
      if (!res.ok) {
        setGmailError(d.error || "Gmail search failed.");
        return;
      }
      setGmailMatches(d.data ?? []);
    } catch {
      setGmailError("Network error.");
    } finally {
      setGmailBusy(false);
    }
  }

  async function add() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/suppliers/${supplierId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to add.");
      } else {
        setEmail("");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/production/supplier-contacts/${id}`, {
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

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Authorized logins</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Anyone on this list can sign in (magic link) and update this supplier’s POs.
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
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(c.id)}>
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="mt-4 border-t border-zinc-100 pt-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
          <Mail className="h-3 w-3" /> Search your Gmail
        </div>
        <div className="flex gap-2">
          <Input
            type="search"
            placeholder="Supplier name, domain, or anything you'd search Gmail for"
            value={gmailQuery}
            onChange={(e) => setGmailQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void searchGmail();
              }
            }}
          />
          <Button
            variant="outline"
            onClick={() => void searchGmail()}
            disabled={gmailBusy || !gmailQuery.trim()}
          >
            <Search className="h-4 w-4" />
            {gmailBusy ? "Searching…" : "Search"}
          </Button>
        </div>
        {gmailError && (
          <p className="mt-2 text-xs text-red-600">{gmailError}</p>
        )}
        {gmailMatches && gmailMatches.length === 0 && (
          <p className="mt-2 text-xs text-zinc-400">
            No emails found in messages matching that query.
          </p>
        )}
        {gmailMatches && gmailMatches.length > 0 && (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {gmailMatches.map((m) => (
              <li key={m.email}>
                <button
                  type="button"
                  className="w-full rounded-md border border-zinc-100 px-3 py-1.5 text-left text-sm text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50"
                  onClick={() => {
                    setEmail(m.email);
                    setGmailMatches(null);
                    setGmailQuery("");
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

      <div className="mt-3 flex gap-2">
        <Input
          type="email"
          placeholder="teammate@vendor.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button onClick={add} disabled={busy || !email.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
