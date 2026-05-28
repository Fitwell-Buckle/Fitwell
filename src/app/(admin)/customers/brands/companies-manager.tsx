"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CompanyForm,
  emptyCompanyDraft,
  tierLabel,
  type CompanyDraft,
} from "@/components/production/company-form";
import {
  CompanyLogins,
  type CompanyLogin,
} from "@/components/production/company-logins";
import { DataTable } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export interface PriceTier {
  id: string;
  name: string;
  discountPercent: number;
}

export interface Company {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  address: string | null;
  customerId: string | null;
  notes: string | null;
  priceTierId: string | null;
  tierName: string | null;
  assignedCollectionIds: string[];
  assignedProductIds: string[];
  depositPercent: number;
  contacts: CompanyLogin[];
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

export function CompaniesManager({
  priceTiers,
  companies,
}: {
  priceTiers: PriceTier[];
  companies: Company[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Price tiers ──
  const [tierEditing, setTierEditing] = useState<string | "new" | null>(null);
  const [tierName, setTierName] = useState("");
  const [tierDiscount, setTierDiscount] = useState("");

  function openTier(id: string | "new", t?: PriceTier) {
    setError(null);
    setTierEditing(id);
    setTierName(t?.name ?? "");
    setTierDiscount(t ? String(t.discountPercent) : "");
  }

  async function saveTier() {
    setError(null);
    if (!tierName.trim()) return setError("Tier name is required.");
    const discountPercent = Number(tierDiscount);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return setError("Discount must be a percentage between 0 and 100.");
    }
    setBusy(true);
    const isNew = tierEditing === "new";
    try {
      const res = await fetch(
        isNew
          ? "/api/production/price-tiers"
          : `/api/production/price-tiers/${tierEditing}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tierName.trim(), discountPercent }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      setTierEditing(null);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Companies ──
  const [companyEditing, setCompanyEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<CompanyDraft>(emptyCompanyDraft());

  function openCompany(id: string | "new", c?: Company) {
    setError(null);
    setCompanyEditing(id);
    setDraft({
      name: c?.name ?? "",
      contactName: c?.contactName ?? "",
      contactEmail: c?.contactEmail ?? "",
      address: c?.address ?? "",
      customerId: c?.customerId ?? "",
      priceTierId: c?.priceTierId ?? "",
      assignedCollectionIds: c?.assignedCollectionIds ?? [],
      assignedProductIds: c?.assignedProductIds ?? [],
      depositPercent: c?.depositPercent ? String(c.depositPercent) : "",
      notes: c?.notes ?? "",
    });
  }

  async function saveCompany() {
    setError(null);
    if (!draft.name.trim()) return setError("Customer name is required.");
    setBusy(true);
    const isNew = companyEditing === "new";
    try {
      const res = await fetch(
        isNew
          ? "/api/production/companies"
          : `/api/production/companies/${companyEditing}`,
        {
          method: isNew ? "POST" : "PATCH",
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
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      setCompanyEditing(null);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const editingCompany =
    companyEditing && companyEditing !== "new"
      ? companies.find((c) => c.id === companyEditing)
      : undefined;

  return (
    <div className="mt-6 space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Price tiers */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Price tiers</h2>
          {tierEditing !== "new" && (
            <Button size="sm" variant="outline" onClick={() => openTier("new")}>
              Add tier
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          A discount off the Shopify retail price, assigned to brands.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {priceTiers.length === 0 && tierEditing !== "new" && (
            <span className="text-sm text-zinc-400">No tiers yet.</span>
          )}
          {priceTiers.map((t) =>
            tierEditing === t.id ? (
              <TierForm
                key={t.id}
                name={tierName}
                discount={tierDiscount}
                setName={setTierName}
                setDiscount={setTierDiscount}
                onSave={saveTier}
                onCancel={() => setTierEditing(null)}
                busy={busy}
              />
            ) : (
              <button
                key={t.id}
                type="button"
                onClick={() => openTier(t.id, t)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                title="Edit tier"
              >
                {tierLabel(t)}
              </button>
            ),
          )}
        </div>
        {tierEditing === "new" && (
          <div className="mt-3">
            <TierForm
              name={tierName}
              discount={tierDiscount}
              setName={setTierName}
              setDiscount={setTierDiscount}
              onSave={saveTier}
              onCancel={() => setTierEditing(null)}
              busy={busy}
            />
          </div>
        )}
      </Card>

      {/* Companies */}
      <div className="flex justify-end">
        {companyEditing !== "new" && (
          <Button onClick={() => openCompany("new")}>Add B2B customer</Button>
        )}
      </div>

      {companyEditing === "new" && (
        <CompanyForm
          title="New brand"
          draft={draft}
          setDraft={setDraft}
          priceTiers={priceTiers}
          onSave={saveCompany}
          onCancel={() => setCompanyEditing(null)}
          busy={busy}
        />
      )}

      <DataTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Price tier</TableHead>
              <TableHead>Can order</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
                  No brands yet.
                </TableCell>
              </TableRow>
            ) : (
              companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/customers/brands/${c.id}`}
                      className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.tierName ? <Badge>{c.tierName}</Badge> : <span className="text-zinc-400">—</span>}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {c.assignedCollectionIds.length === 0 && c.assignedProductIds.length === 0 ? (
                      <span className="text-zinc-400">All</span>
                    ) : (
                      [
                        c.assignedCollectionIds.length > 0 &&
                          `${c.assignedCollectionIds.length} coll.`,
                        c.assignedProductIds.length > 0 &&
                          `${c.assignedProductIds.length} prod.`,
                      ]
                        .filter(Boolean)
                        .join(" + ")
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {c.contactName ?? c.contactEmail ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openCompany(c.id, c)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>

      {editingCompany && (
        <>
          <CompanyForm
            title="Edit brand"
            draft={draft}
            setDraft={setDraft}
            priceTiers={priceTiers}
            onSave={saveCompany}
            onCancel={() => setCompanyEditing(null)}
            busy={busy}
          />
          <CompanyLogins companyId={editingCompany.id} contacts={editingCompany.contacts} />
        </>
      )}
    </div>
  );
}

function TierForm({
  name,
  discount,
  setName,
  setDiscount,
  onSave,
  onCancel,
  busy,
}: {
  name: string;
  discount: string;
  setName: (v: string) => void;
  setDiscount: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-end gap-2 rounded-lg border border-zinc-200 p-3">
      <div>
        <label className={fieldLabel}>Tier name</label>
        <Input className="w-40" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className={fieldLabel}>% off</label>
        <Input
          className="w-24"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}

