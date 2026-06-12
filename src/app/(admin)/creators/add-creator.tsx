"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

export function AddCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    platform: "ig",
    handle: "",
    profileUrl: "",
    email: "",
  });

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      toast.success(`Added ${form.name}`);
      setOpen(false);
      router.push(`/creators/${json.data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add creator
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
      <input
        autoFocus
        placeholder="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className={`${inputCls} w-40`}
      />
      <select
        value={form.platform}
        onChange={(e) => setForm({ ...form, platform: e.target.value })}
        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
      >
        <option value="ig">IG</option>
        <option value="yt">YT</option>
        <option value="tt">TT</option>
      </select>
      <input
        placeholder="@handle"
        value={form.handle}
        onChange={(e) => setForm({ ...form, handle: e.target.value })}
        className={`${inputCls} w-36`}
      />
      <input
        placeholder="Email (optional)"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className={`${inputCls} w-48`}
      />
      <Button size="sm" onClick={submit} disabled={busy || !form.name || !form.handle}>
        {busy ? "Adding…" : "Add"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
