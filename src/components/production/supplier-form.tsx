"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GmailEmailInput } from "@/components/crm/gmail-email-input";

export interface SupplierDraft {
  name: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  shippingAddress: string;
  notes: string;
}

export function emptySupplierDraft(): SupplierDraft {
  return {
    name: "",
    contactName: "",
    contactEmail: "",
    phone: "",
    shippingAddress: "",
    notes: "",
  };
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const textareaCls =
  "flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

/**
 * The full supplier create form. Matches every column on `supplier` so a
 * supplier added inline from the PO form has the same fields as one added
 * from a future suppliers manager (no second-tier "quick add" with fewer
 * fields).
 */
export function SupplierForm({
  title,
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  error,
}: {
  title: string;
  draft: SupplierDraft;
  setDraft: (d: SupplierDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error?: string | null;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Name</label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div>
          <label className={fieldLabel}>Contact name</label>
          <Input
            value={draft.contactName}
            onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
          />
        </div>
        <div>
          <label className={fieldLabel}>Contact email</label>
          {/* Type to search your Gmail inline; picking a match fills the
              contact name too (only when it's still blank). */}
          <GmailEmailInput
            placeholder="Search your Gmail or type an email"
            value={draft.contactEmail}
            onChange={(v) => setDraft({ ...draft, contactEmail: v })}
            onPickContact={(m) =>
              setDraft({
                ...draft,
                contactEmail: m.email,
                contactName: draft.contactName.trim() || m.name || "",
              })
            }
          />
        </div>
        <div>
          <label className={fieldLabel}>Phone</label>
          <Input
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            placeholder="+1 415 555 0199"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Used to match inbound WhatsApp messages to this supplier.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Shipping address</label>
          <textarea
            value={draft.shippingAddress}
            onChange={(e) =>
              setDraft({ ...draft, shippingAddress: e.target.value })
            }
            rows={3}
            className={textareaCls}
            placeholder="Street, City, State ZIP, Country"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Where we ship materials / handoffs to this supplier.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Supplier notes</label>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            rows={2}
            className={textareaCls}
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
