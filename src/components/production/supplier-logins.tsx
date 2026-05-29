"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GmailContactSearch } from "./gmail-contact-search";

export interface SupplierLogin {
  id: string;
  email: string;
  name: string | null;
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
      <GmailContactSearch
        className="mt-4 border-t border-zinc-100 pt-4"
        onPick={(m) => setEmail(m.email)}
      />

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
