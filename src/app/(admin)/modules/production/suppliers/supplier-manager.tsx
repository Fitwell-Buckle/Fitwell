"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
}

interface Draft {
  name: string;
  contactName: string;
  contactEmail: string;
  notes: string;
}

function toDraft(s?: Supplier): Draft {
  return {
    name: s?.name ?? "",
    contactName: s?.contactName ?? "",
    contactEmail: s?.contactEmail ?? "",
    notes: s?.notes ?? "",
  };
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

function SupplierForm({
  title,
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  error,
}: {
  title: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
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
          <Input
            type="email"
            value={draft.contactEmail}
            onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
          />
        </div>
        <div>
          <label className={fieldLabel}>Notes</label>
          <Input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
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

export function SupplierManager({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  // null = no form open; "new" = create; otherwise the supplier id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(id: string | "new", s?: Supplier) {
    setError(null);
    setEditing(id);
    setDraft(toDraft(s));
  }
  function close() {
    setEditing(null);
    setError(null);
  }

  async function save() {
    setError(null);
    if (!draft.name.trim()) return setError("Name is required.");

    setBusy(true);
    const isNew = editing === "new";
    const url = isNew
      ? "/api/production/suppliers"
      : `/api/production/suppliers/${editing}`;
    try {
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          contactName: draft.contactName.trim() || null,
          contactEmail: draft.contactEmail.trim() || null,
          notes: draft.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Save failed.");
        setBusy(false);
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex justify-end">
        {editing !== "new" && <Button onClick={() => open("new")}>Add supplier</Button>}
      </div>

      {editing === "new" && (
        <SupplierForm
          title="New supplier"
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={close}
          busy={busy}
          error={error}
        />
      )}

      <DataTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-zinc-400">
                  No suppliers yet.
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-zinc-900">{s.name}</TableCell>
                  <TableCell className="text-zinc-500">{s.contactName ?? "—"}</TableCell>
                  <TableCell className="text-zinc-500">{s.contactEmail ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => open(s.id, s)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>

      {editing && editing !== "new" && (
        <SupplierForm
          title="Edit supplier"
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={close}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}
