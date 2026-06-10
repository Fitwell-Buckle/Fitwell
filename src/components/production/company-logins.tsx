"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GmailEmailInput } from "@/components/crm/gmail-email-input";

export interface CompanyLogin {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Portal-login allowlist for a B2B company. Adds / removes magic-link signin
 * emails for the brand. The email field searches your Gmail inline as you
 * type — pick a match (or paste a known address) and hit Add. Shared between
 * the brands manager and the customer detail page.
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
        <div className="flex-1">
          <GmailEmailInput
            placeholder="Search your Gmail or paste an email"
            value={value}
            onChange={setValue}
            // Picking fills the email; Enter on a complete address adds it.
            onEnter={() => {
              if (looksLikeEmail) void add();
            }}
          />
        </div>
        <Button onClick={() => void add()} disabled={busy || !looksLikeEmail}>
          Add
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );

  return embedded ? <div>{body}</div> : <Card className="p-6">{body}</Card>;
}
