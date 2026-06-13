"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  allowWirePayment: boolean;
  notes: string | null;
  assignedCollectionIds: string[];
  assignedProductIds: string[];
}

// Shopify-synced address for the linked customer (subset of `customer_address`).
export interface CompanyAddress {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  isDefault: boolean | null;
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
    allowWirePayment: c.allowWirePayment,
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
  addresses,
  priceTiers,
}: {
  customer: CustomerDetail;
  contacts: CompanyLogin[];
  addresses: CompanyAddress[];
  priceTiers: CompanyFormPriceTier[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft>(toDraft(customer));
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncingAddr, setSyncingAddr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull the linked Shopify customers' addresses into our table on demand —
  // persists, so the tab + invoices show real synced data.
  async function syncAddresses() {
    setSyncingAddr(true);
    try {
      const res = await fetch(
        `/api/production/companies/${customer.id}/sync-addresses`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? "Couldn't sync addresses.");
        return;
      }
      toast.success(json?.data?.message ?? "Synced from Shopify.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sync addresses.");
    } finally {
      setSyncingAddr(false);
    }
  }

  // Delete this B2B customer. The API unlinks soft references (attached people,
  // detected messages) and blocks if it still has invoices/POs. On success the
  // detail page is gone, so go back to the list.
  async function remove() {
    if (
      !window.confirm(
        `Delete B2B customer "${customer.name}"? This can't be undone. ` +
          `Attached people and detected messages will be unlinked. ` +
          `Invoices or purchase orders will block the delete.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/production/companies/${customer.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Delete failed.");
        setDeleting(false);
        return;
      }
      toast.success(`Deleted ${customer.name}`);
      router.push("/customers/brands");
      router.refresh();
    } catch {
      toast.error("Network error — please try again.");
      setDeleting(false);
    }
  }

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
          allowWirePayment: draft.allowWirePayment,
          notes: draft.notes.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      const rp = d.data?.reprice;
      if (rp?.repriced > 0) {
        toast.success(
          `Re-priced ${rp.repriced} open invoice${rp.repriced === 1 ? "" : "s"} to the new tier` +
            (rp.shopifyFailures > 0
              ? ` (${rp.shopifyFailures} pay link${rp.shopifyFailures === 1 ? "" : "s"} need a manual resend)`
              : "") +
            ".",
        );
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

  // While editing, swap the whole card for the full company form (its own
  // Save/Cancel). Otherwise show the tabbed read-only view.
  if (editing) {
    return (
      <div className="mt-6">
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
      </div>
    );
  }

  return (
    <Card className="mt-6 p-6">
      <Tabs defaultValue="details">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="addresses">
              Addresses ({addresses.length})
            </TabsTrigger>
            <TabsTrigger value="logins">
              Additional logins ({contacts.length})
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href={`/invoices/new?customerId=${customer.id}`}>
                Create B2B Order
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit customer
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

        <TabsContent value="details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </TabsContent>

        <TabsContent value="addresses">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-400">
              Synced from the linked Shopify customer(s)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={syncAddresses}
              disabled={syncingAddr}
            >
              {syncingAddr ? "Syncing…" : "Sync from Shopify"}
            </Button>
          </div>
          {addresses.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No addresses on file yet — click <strong>Sync from Shopify</strong>{" "}
              to pull them in now (or they appear after the next customer sync).
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => {
                const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
                const cityLine = [a.city, a.provinceCode ?? a.province, a.zip]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li
                    key={a.id}
                    className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">
                        {name || "—"}
                      </span>
                      {a.isDefault && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                          Default
                        </span>
                      )}
                    </div>
                    {a.company && (
                      <div className="text-xs text-zinc-500">{a.company}</div>
                    )}
                    {a.address1 && <div>{a.address1}</div>}
                    {a.address2 && <div>{a.address2}</div>}
                    {cityLine && <div>{cityLine}</div>}
                    {a.country && (
                      <div className="text-xs text-zinc-500">{a.country}</div>
                    )}
                    {a.phone && (
                      <div className="mt-1 text-xs text-zinc-500">{a.phone}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="logins">
          <CompanyLogins companyId={customer.id} contacts={contacts} embedded />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
