"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CompanyForm,
  emptyCompanyDraft,
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

  // ── Companies ── (price tiers are managed in Settings now)
  const [companyEditing, setCompanyEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<CompanyDraft>(emptyCompanyDraft());
  // Client-side filter by company name / contact name / contact email.
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filteredCompanies = q
    ? companies.filter((c) =>
        [c.name, c.contactName, c.contactEmail].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      )
    : companies;

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

      <div className="mt-6 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex h-9 w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
        />
      </div>

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
            {filteredCompanies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
                  {companies.length === 0
                    ? "No brands yet."
                    : "No brands match your search."}
                </TableCell>
              </TableRow>
            ) : (
              filteredCompanies.map((c) => (
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


