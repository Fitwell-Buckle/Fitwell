"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SupplierForm,
  type SupplierDraft,
} from "@/components/production/supplier-form";
import {
  SupplierLogins,
  type SupplierLogin,
} from "@/components/production/supplier-logins";

export interface SupplierDetail {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  shippingAddress: string | null;
  notes: string | null;
}

function toDraft(s: SupplierDetail): SupplierDraft {
  return {
    name: s.name,
    contactName: s.contactName ?? "",
    contactEmail: s.contactEmail ?? "",
    phone: s.phone ?? "",
    shippingAddress: s.shippingAddress ?? "",
    notes: s.notes ?? "",
  };
}

const detailLabel = "text-xs uppercase tracking-wider text-zinc-400";

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className={detailLabel}>{label}</div>
      <div className="mt-0.5 whitespace-pre-line text-sm text-zinc-700">
        {value && value.trim() ? value : <span className="text-zinc-300">—</span>}
      </div>
    </div>
  );
}

export function SupplierDetailView({
  supplier,
  contacts,
}: {
  supplier: SupplierDetail;
  contacts: SupplierLogin[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SupplierDraft>(toDraft(supplier));
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete this supplier. The API unlinks detected messages and blocks if it
  // still has POs. On success the detail page is gone, so go back to the list.
  async function remove() {
    if (
      !window.confirm(
        `Delete supplier "${supplier.name}"? This can't be undone. ` +
          `Purchase orders will block the delete.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/production/suppliers/${supplier.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Delete failed.");
        setDeleting(false);
        return;
      }
      toast.success(`Deleted ${supplier.name}`);
      router.push("/modules/production/suppliers");
      router.refresh();
    } catch {
      toast.error("Network error — please try again.");
      setDeleting(false);
    }
  }

  async function save() {
    setError(null);
    if (!draft.name.trim()) return setError("Supplier name is required.");
    setBusy(true);
    try {
      const res = await fetch(`/api/production/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          contactName: draft.contactName.trim() || null,
          contactEmail: draft.contactEmail.trim() || null,
          phone: draft.phone.trim() || null,
          shippingAddress: draft.shippingAddress.trim() || null,
          notes: draft.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      {editing ? (
        <SupplierForm
          title="Edit supplier"
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          error={error}
          onCancel={() => {
            setDraft(toDraft(supplier));
            setError(null);
            setEditing(false);
          }}
          onSave={save}
        />
      ) : (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">Supplier details</h2>
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link href={`/modules/production/po/new?supplierId=${supplier.id}`}>
                  Create PO
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit supplier
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={deleting}
                onClick={remove}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="Name" value={supplier.name} />
            <DetailField label="Contact name" value={supplier.contactName} />
            <DetailField label="Contact email" value={supplier.contactEmail} />
            <DetailField label="Phone" value={supplier.phone} />
            <div className="sm:col-span-2">
              <DetailField label="Shipping address" value={supplier.shippingAddress} />
            </div>
            <div className="sm:col-span-2">
              <DetailField label="Supplier notes" value={supplier.notes} />
            </div>
          </div>
        </Card>
      )}

      <SupplierLogins supplierId={supplier.id} contacts={contacts} />
    </div>
  );
}
