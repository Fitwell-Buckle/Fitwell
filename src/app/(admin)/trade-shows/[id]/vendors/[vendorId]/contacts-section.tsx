"use client";

import { useRef, useState } from "react";
import {
  UserPlus,
  CreditCard,
  Loader2,
  Trash2,
  Star,
  Mic,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDictation } from "@/components/ui/use-dictation";

export interface VendorContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isPrimary: boolean;
  cardImageUrl: string | null;
}

interface ScanResult {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  cardImageUrl: string;
  cardRawText?: string;
  confidence?: Record<string, number>;
}

export function ContactsSection({
  baseUrl,
  initialContacts,
}: {
  baseUrl: string;
  initialContacts: VendorContact[];
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function upsertLocal(c: VendorContact) {
    setContacts((list) => {
      const exists = list.some((x) => x.id === c.id);
      const next = exists
        ? list.map((x) => (x.id === c.id ? c : x))
        : [...list, c];
      // Keep primary first, preserve relative order otherwise.
      return [...next].sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
      );
    });
  }

  async function addBlank() {
    setAdding(true);
    try {
      const res = await fetch(`${baseUrl}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      upsertLocal({
        id: json.data.id,
        firstName: null,
        lastName: null,
        title: null,
        email: null,
        phone: null,
        notes: null,
        isPrimary: contacts.length === 0,
        cardImageUrl: null,
      });
    } catch {
      toast.error("Couldn't add contact");
    } finally {
      setAdding(false);
    }
  }

  async function onScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const scanRes = await fetch(`${baseUrl}/scan-card`, {
        method: "POST",
        body: form,
      });
      const scanJson = await scanRes.json();
      if (!scanRes.ok) throw new Error(scanJson?.error ?? "Scan failed");
      const d = scanJson.data as ScanResult;

      // Create a new contact from the extraction.
      const res = await fetch(`${baseUrl}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: d.firstName,
          lastName: d.lastName,
          title: d.title,
          email: d.email,
          phone: d.phone,
          cardImageUrl: d.cardImageUrl,
          cardRawText: d.cardRawText ?? null,
          ocrConfidence: d.confidence ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      upsertLocal({
        id: json.data.id,
        firstName: d.firstName,
        lastName: d.lastName,
        title: d.title,
        email: d.email,
        phone: d.phone,
        notes: null,
        isPrimary: contacts.length === 0,
        cardImageUrl: d.cardImageUrl,
      });
      toast.success("Card scanned — contact added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function onMadePrimary(id: string) {
    setContacts((list) =>
      [...list.map((c) => ({ ...c, isPrimary: c.id === id }))].sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
      ),
    );
  }

  function onDeleted(id: string) {
    setContacts((list) => {
      const remaining = list.filter((c) => c.id !== id);
      // Mirror the server: if we removed the primary, the oldest remaining
      // becomes primary.
      if (
        remaining.length &&
        !remaining.some((c) => c.isPrimary) &&
        list.find((c) => c.id === id)?.isPrimary
      ) {
        remaining[0] = { ...remaining[0], isPrimary: true };
      }
      return remaining;
    });
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">
          Contacts{contacts.length > 0 && ` (${contacts.length})`}
        </h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onScanFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
          >
            {scanning ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-1.5 h-4 w-4" />
            )}
            Scan card
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBlank}
            disabled={adding}
          >
            {adding ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1.5 h-4 w-4" />
            )}
            Add
          </Button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-zinc-400">
            No contacts yet. Scan a card or add one manually.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              baseUrl={baseUrl}
              contact={c}
              canDemote={contacts.length > 1}
              onMadePrimary={() => onMadePrimary(c.id)}
              onDeleted={() => onDeleted(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactCard({
  baseUrl,
  contact,
  canDemote,
  onMadePrimary,
  onDeleted,
}: {
  baseUrl: string;
  contact: VendorContact;
  canDemote: boolean;
  onMadePrimary: () => void;
  onDeleted: () => void;
}) {
  const [c, setC] = useState(contact);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const url = `${baseUrl}/contacts/${contact.id}`;

  function set<K extends keyof VendorContact>(k: K, v: VendorContact[K]) {
    setC((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: c.firstName,
          lastName: c.lastName,
          title: c.title,
          email: c.email,
          phone: c.phone,
          notes: c.notes,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary() {
    set("isPrimary", true);
    onMadePrimary();
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't set primary");
    }
  }

  async function remove() {
    const label =
      [c.firstName, c.lastName].filter(Boolean).join(" ") || "this contact";
    if (!window.confirm(`Delete ${label}?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted();
      toast.success("Contact deleted");
    } catch {
      setDeleting(false);
      toast.error("Couldn't delete");
    }
  }

  const dictation = useDictation(
    (full) => set("notes", full),
    () => c.notes ?? "",
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        {c.isPrimary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Primary
          </span>
        ) : (
          <button
            type="button"
            onClick={makePrimary}
            disabled={!canDemote}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <Star className="h-3 w-3" /> Make primary
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          aria-label="Delete contact"
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ContactField
          label="First name"
          value={c.firstName}
          onChange={(v) => set("firstName", v)}
        />
        <ContactField
          label="Last name"
          value={c.lastName}
          onChange={(v) => set("lastName", v)}
        />
        <ContactField
          label="Title"
          value={c.title}
          onChange={(v) => set("title", v)}
          className="sm:col-span-2"
        />
        <ContactField
          label="Email"
          type="email"
          value={c.email}
          onChange={(v) => set("email", v)}
        />
        <ContactField
          label="Phone"
          value={c.phone}
          onChange={(v) => set("phone", v)}
        />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-500">Notes</label>
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.toggle}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
                dictation.listening
                  ? "bg-red-50 text-red-600"
                  : "text-zinc-400 hover:text-zinc-600",
              )}
            >
              <Mic className="h-3.5 w-3.5" />
              {dictation.listening ? "Listening…" : "Dictate"}
            </button>
          )}
        </div>
        <textarea
          value={c.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          placeholder="Role, what they handle, follow-up owner…"
          className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
      </div>

      {c.cardImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.cardImageUrl}
          alt="Business card"
          className="mt-3 max-h-40 rounded-md border border-zinc-200"
        />
      )}

      <Button className="mt-3" size="sm" onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save
      </Button>
    </Card>
  );
}

function ContactField({
  label,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-zinc-500">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
      />
    </div>
  );
}
