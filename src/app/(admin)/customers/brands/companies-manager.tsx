"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { CustomerMatch } from "@/app/api/production/customer-search/route";
import { useCatalog } from "@/components/catalog/use-catalog";
import { ProductCombobox, type CatalogVariant } from "@/components/catalog/product-combobox";
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

export interface CompanyLogin {
  id: string;
  email: string;
  name: string | null;
}

export interface Company {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
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
const inputBase =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

function tierLabel(t: PriceTier): string {
  return `${t.name} (${t.discountPercent}% off)`;
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
  const [draft, setDraft] = useState<CompanyDraft>({
    name: "",
    contactName: "",
    contactEmail: "",
    customerId: "",
    priceTierId: "",
    assignedCollectionIds: [],
    assignedProductIds: [],
    depositPercent: "",
    notes: "",
  });

  function openCompany(id: string | "new", c?: Company) {
    setError(null);
    setCompanyEditing(id);
    setDraft({
      name: c?.name ?? "",
      contactName: c?.contactName ?? "",
      contactEmail: c?.contactEmail ?? "",
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
    if (!draft.name.trim()) return setError("Brand name is required.");
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
          <Button onClick={() => openCompany("new")}>Add brand</Button>
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
              <TableHead>Brand</TableHead>
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
                  <TableCell className="font-medium text-zinc-900">{c.name}</TableCell>
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

interface CompanyDraft {
  name: string;
  contactName: string;
  contactEmail: string;
  customerId: string; // linked Shopify (synced) customer
  priceTierId: string;
  assignedCollectionIds: string[];
  assignedProductIds: string[];
  depositPercent: string; // form input; "" = 0 (pay in full)
  notes: string;
}

/** Contact field that searches the synced Shopify customer list as you type. */
function CustomerSearchField({
  label,
  type,
  value,
  onChange,
  onPick,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (m: CustomerMatch) => void;
}) {
  const [results, setResults] = useState<CustomerMatch[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleType(v: string) {
    onChange(v);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (v.trim().length < 2) return setResults([]);
      try {
        const res = await fetch(
          `/api/production/customer-search?q=${encodeURIComponent(v.trim())}`,
        );
        const d = await res.json();
        if (res.ok) setResults((d.data ?? []) as CustomerMatch[]);
      } catch {
        /* ignore */
      }
    }, 250);
  }

  return (
    <div className="relative">
      <label className={fieldLabel}>{label}</label>
      <Input
        type={type}
        value={value}
        autoComplete="off"
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-md">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                  setResults([]);
                }}
                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-zinc-50"
              >
                <span className="text-sm text-zinc-900">{m.name}</span>
                {m.email && <span className="text-xs text-zinc-400">{m.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompanyForm({
  title,
  draft,
  setDraft,
  priceTiers,
  onSave,
  onCancel,
  busy,
}: {
  title: string;
  draft: CompanyDraft;
  setDraft: (d: CompanyDraft) => void;
  priceTiers: PriceTier[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { variants, collections, loading: catalogLoading } = useCatalog();
  // Shopify product id → display title (first variant's product title).
  const productTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variants) if (!m.has(v.shopifyProductId)) m.set(v.shopifyProductId, v.title);
    return m;
  }, [variants]);
  // Hide already-assigned products from the picker.
  const excludeVariants = useMemo(() => {
    const ids = new Set(draft.assignedProductIds);
    return new Set(
      variants.filter((v) => ids.has(v.shopifyProductId)).map((v) => v.shopifyVariantId),
    );
  }, [variants, draft.assignedProductIds]);

  function addProducts(vs: CatalogVariant[]) {
    const ids = new Set(draft.assignedProductIds);
    for (const v of vs) ids.add(v.shopifyProductId);
    setDraft({ ...draft, assignedProductIds: [...ids] });
  }
  function removeProduct(pid: string) {
    setDraft({
      ...draft,
      assignedProductIds: draft.assignedProductIds.filter((p) => p !== pid),
    });
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Name</label>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label className={fieldLabel}>Price tier</label>
          <select
            className={inputBase}
            value={draft.priceTierId}
            onChange={(e) => setDraft({ ...draft, priceTierId: e.target.value })}
          >
            <option value="">— none —</option>
            {priceTiers.map((t) => (
              <option key={t.id} value={t.id}>
                {tierLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Deposit %</label>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="0"
            value={draft.depositPercent}
            onChange={(e) => setDraft({ ...draft, depositPercent: e.target.value })}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Collected up front; the balance is billed when the order is fulfilled. 0 = pay in full.
          </p>
        </div>
        <CustomerSearchField
          label="Contact name (search customers)"
          value={draft.contactName}
          onChange={(v) => setDraft({ ...draft, contactName: v, customerId: "" })}
          onPick={(m) =>
            setDraft({
              ...draft,
              contactName: m.name,
              contactEmail: m.email ?? "",
              customerId: m.id,
            })
          }
        />
        <CustomerSearchField
          label="Contact email (search customers)"
          type="email"
          value={draft.contactEmail}
          onChange={(v) => setDraft({ ...draft, contactEmail: v, customerId: "" })}
          onPick={(m) =>
            setDraft({
              ...draft,
              contactName: m.name,
              contactEmail: m.email ?? "",
              customerId: m.id,
            })
          }
        />
        {draft.customerId && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 sm:col-span-2">
            <span>✓ Linked to a Shopify customer</span>
            <button
              type="button"
              className="underline"
              onClick={() => setDraft({ ...draft, customerId: "" })}
            >
              unlink
            </button>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Order restriction (optional)</label>
          <p className="mb-2 text-xs text-zinc-500">
            Limit which products this brand can order — search and add them below
            (filter by collection right in the picker). Leave empty to allow the
            whole catalog.
          </p>
          <ProductCombobox
            variants={variants}
            collections={collections}
            value=""
            exclude={excludeVariants}
            disabled={catalogLoading}
            placeholder={catalogLoading ? "Loading catalog…" : "Add products…"}
            onSelect={(v) => addProducts([v])}
            onSelectMany={addProducts}
          />
          {draft.assignedProductIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.assignedProductIds.map((pid) => (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                >
                  {productTitle.get(pid) ?? "Product"}
                  <button
                    type="button"
                    onClick={() => removeProduct(pid)}
                    aria-label="Remove product"
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Notes</label>
          <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
      </div>
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

function CompanyLogins({
  companyId,
  contacts,
}: {
  companyId: string;
  contacts: CompanyLogin[];
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
      const res = await fetch(`/api/production/companies/${companyId}/contacts`, {
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

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Portal logins</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Anyone on this list can sign in (magic link) to the B2B portal and order
        at this brand’s pricing.
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
      <div className="mt-3 flex gap-2">
        <Input
          type="email"
          placeholder="buyer@company.com"
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
