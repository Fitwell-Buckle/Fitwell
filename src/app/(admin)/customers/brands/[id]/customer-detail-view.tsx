"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CompanyForm,
  type CompanyDraft,
  type CompanyFormPriceTier,
} from "@/components/production/company-form";
import {
  CompanyLogins,
  type CompanyLogin,
} from "@/components/production/company-logins";

export interface CustomerDetail {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  address: string | null;
  customerId: string | null;
  priceTierId: string | null;
  tierName: string | null;
  tierDiscount: number;
  depositPercent: number;
  notes: string | null;
  assignedCollectionIds: string[];
  assignedProductIds: string[];
}

function toDraft(c: CustomerDetail): CompanyDraft {
  return {
    name: c.name,
    contactName: c.contactName ?? "",
    contactEmail: c.contactEmail ?? "",
    address: c.address ?? "",
    customerId: c.customerId ?? "",
    priceTierId: c.priceTierId ?? "",
    assignedCollectionIds: c.assignedCollectionIds,
    assignedProductIds: c.assignedProductIds,
    depositPercent: c.depositPercent > 0 ? String(c.depositPercent) : "",
    notes: c.notes ?? "",
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

export function CustomerDetailView({
  customer,
  contacts,
  priceTiers,
}: {
  customer: CustomerDetail;
  contacts: CompanyLogin[];
  priceTiers: CompanyFormPriceTier[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft>(toDraft(customer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!draft.name.trim()) return setError("Customer name is required.");
    setBusy(true);
    try {
      const res = await fetch(`/api/production/companies/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          contactName: draft.contactName.trim() || null,
          contactEmail: draft.contactEmail.trim() || null,
          address: draft.address.trim() || null,
          customerId: draft.customerId || null,
          priceTierId: draft.priceTierId || null,
          assignedCollectionIds: draft.assignedCollectionIds,
          assignedProductIds: draft.assignedProductIds,
          depositPercent: draft.depositPercent.trim()
            ? Number(draft.depositPercent)
            : 0,
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

  const restrictionText =
    customer.assignedCollectionIds.length === 0 && customer.assignedProductIds.length === 0
      ? "Full catalog"
      : [
          customer.assignedCollectionIds.length > 0 &&
            `${customer.assignedCollectionIds.length} collection${customer.assignedCollectionIds.length === 1 ? "" : "s"}`,
          customer.assignedProductIds.length > 0 &&
            `${customer.assignedProductIds.length} product${customer.assignedProductIds.length === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" + ");

  return (
    <div className="mt-6 space-y-5">
      {editing ? (
        <CompanyForm
          title="Edit customer"
          draft={draft}
          setDraft={setDraft}
          priceTiers={priceTiers}
          busy={busy}
          error={error}
          onCancel={() => {
            setDraft(toDraft(customer));
            setError(null);
            setEditing(false);
          }}
          onSave={save}
        />
      ) : (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">Customer details</h2>
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link href={`/invoices/new?customerId=${customer.id}`}>
                  Create B2B Order
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit customer
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="Name" value={customer.name} />
            <DetailField
              label="Price tier"
              value={
                customer.tierName
                  ? `${customer.tierName} (${customer.tierDiscount}% off)`
                  : null
              }
            />
            <DetailField label="Contact name" value={customer.contactName} />
            <DetailField label="Contact email" value={customer.contactEmail} />
            <DetailField
              label="Deposit"
              value={
                customer.depositPercent > 0
                  ? `${customer.depositPercent}%`
                  : "Pay in full"
              }
            />
            <DetailField
              label="Shopify link"
              value={customer.customerId ? "✓ Linked" : null}
            />
            <DetailField label="Order restriction" value={restrictionText} />
            <div className="sm:col-span-2">
              <DetailField label="Address" value={customer.address} />
            </div>
            <div className="sm:col-span-2">
              <DetailField label="Customer notes" value={customer.notes} />
            </div>
          </div>
        </Card>
      )}

      <CompanyLogins companyId={customer.id} contacts={contacts} />
    </div>
  );
}
