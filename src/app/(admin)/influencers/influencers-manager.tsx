"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerMatch } from "@/app/api/production/customer-search/route";
import { DataTable } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export interface CollectionOption {
  id: string;
  title: string;
}

export interface InfluencerLogin {
  id: string;
  email: string;
  name: string | null;
}

export interface Influencer {
  id: string;
  name: string;
  handle: string | null;
  platform: string | null;
  contactName: string | null;
  contactEmail: string | null;
  customerId: string | null;
  assignedCollectionIds: string[];
  notes: string | null;
  contacts: InfluencerLogin[];
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputBase =
  "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

const PLATFORMS = ["Instagram", "TikTok", "YouTube", "X", "Other"];

export function InfluencersManager({
  collections,
  influencers,
}: {
  collections: CollectionOption[];
  influencers: Influencer[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<InfluencerDraft>(emptyDraft());

  function openEditor(id: string | "new", i?: Influencer) {
    setError(null);
    setEditing(id);
    setDraft({
      name: i?.name ?? "",
      handle: i?.handle ?? "",
      platform: i?.platform ?? "",
      contactName: i?.contactName ?? "",
      contactEmail: i?.contactEmail ?? "",
      customerId: i?.customerId ?? "",
      assignedCollectionIds: i?.assignedCollectionIds ?? [],
      notes: i?.notes ?? "",
    });
  }

  async function save() {
    setError(null);
    if (!draft.name.trim()) return setError("Name is required.");
    setBusy(true);
    const isNew = editing === "new";
    try {
      const res = await fetch(
        isNew ? "/api/influencers" : `/api/influencers/${editing}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            handle: draft.handle.trim() || null,
            platform: draft.platform || null,
            contactName: draft.contactName.trim() || null,
            contactEmail: draft.contactEmail.trim() || null,
            customerId: draft.customerId || null,
            assignedCollectionIds: draft.assignedCollectionIds,
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
      setEditing(null);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const editingInfluencer =
    editing && editing !== "new"
      ? influencers.find((i) => i.id === editing)
      : undefined;

  const collectionTitle = (id: string) =>
    collections.find((c) => c.id === id)?.title ?? "1 collection";

  return (
    <div className="mt-6 space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        {editing !== "new" && (
          <Button onClick={() => openEditor("new")}>Add influencer</Button>
        )}
      </div>

      {editing === "new" && (
        <InfluencerForm
          title="New influencer"
          draft={draft}
          setDraft={setDraft}
          collections={collections}
          onSave={save}
          onCancel={() => setEditing(null)}
          busy={busy}
        />
      )}

      <DataTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Influencer</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Collections</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {influencers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
                  No influencers yet.
                </TableCell>
              </TableRow>
            ) : (
              influencers.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium text-zinc-900">
                    {i.name}
                    {i.handle && (
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        {i.handle}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {i.platform ?? "—"}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {i.assignedCollectionIds.length === 0 ? (
                      <span className="text-zinc-400">All</span>
                    ) : (
                      <span>
                        {i.assignedCollectionIds.length === 1
                          ? collectionTitle(i.assignedCollectionIds[0])
                          : `${i.assignedCollectionIds.length} collections`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {i.contactName ?? i.contactEmail ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openEditor(i.id, i)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>

      {editingInfluencer && (
        <>
          <InfluencerForm
            title="Edit influencer"
            draft={draft}
            setDraft={setDraft}
            collections={collections}
            onSave={save}
            onCancel={() => setEditing(null)}
            busy={busy}
          />
          <InfluencerLogins
            influencerId={editingInfluencer.id}
            contacts={editingInfluencer.contacts}
          />
        </>
      )}
    </div>
  );
}

interface InfluencerDraft {
  name: string;
  handle: string;
  platform: string;
  contactName: string;
  contactEmail: string;
  customerId: string; // linked Shopify (synced) customer
  assignedCollectionIds: string[];
  notes: string;
}

function emptyDraft(): InfluencerDraft {
  return {
    name: "",
    handle: "",
    platform: "",
    contactName: "",
    contactEmail: "",
    customerId: "",
    assignedCollectionIds: [],
    notes: "",
  };
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

function InfluencerForm({
  title,
  draft,
  setDraft,
  collections,
  onSave,
  onCancel,
  busy,
}: {
  title: string;
  draft: InfluencerDraft;
  setDraft: (d: InfluencerDraft) => void;
  collections: CollectionOption[];
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  function toggleCollection(id: string) {
    setDraft({
      ...draft,
      assignedCollectionIds: draft.assignedCollectionIds.includes(id)
        ? draft.assignedCollectionIds.filter((x) => x !== id)
        : [...draft.assignedCollectionIds, id],
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>Handle</label>
            <Input
              placeholder="@username"
              value={draft.handle}
              onChange={(e) => setDraft({ ...draft, handle: e.target.value })}
            />
          </div>
          <div>
            <label className={fieldLabel}>Platform</label>
            <select
              className={inputBase}
              value={draft.platform}
              onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
            >
              <option value="">— none —</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
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
          <label className={fieldLabel}>Assigned collections</label>
          <p className="mb-2 text-xs text-zinc-500">
            Which collections this influencer can order from. Leave all
            unchecked to allow every collection.
          </p>
          {collections.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Shopify catalog unavailable — collections can’t be listed right now.
            </p>
          ) : (
            <div className="flex max-h-44 flex-wrap gap-2 overflow-auto">
              {collections.map((c) => {
                const on = draft.assignedCollectionIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCollection(c.id)}
                    className={
                      on
                        ? "rounded-full border border-brand bg-brand px-3 py-1 text-sm text-white"
                        : "rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    }
                  >
                    {c.title}
                  </button>
                );
              })}
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

function InfluencerLogins({
  influencerId,
  contacts,
}: {
  influencerId: string;
  contacts: InfluencerLogin[];
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
      const res = await fetch(`/api/influencers/${influencerId}/contacts`, {
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
      const res = await fetch(`/api/influencer-contacts/${id}`, {
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
        Anyone on this list will be able to sign in (magic link) to the
        influencer portal once it’s live, and order from their assigned
        collections.
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
          placeholder="creator@example.com"
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
