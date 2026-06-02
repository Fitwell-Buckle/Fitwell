"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  const [error, setError] = useState<string | null>(null);

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
