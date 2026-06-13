"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const inputCls =
  "rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

/**
 * Add a channel (platform) to a creator. On success the server pulls the
 * channel's stats + recent posts immediately (YT / IG); if its API key
 * isn't set, the row is created and fills on the next refresh cron.
 */
export function AddPlatform({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    platform: "yt",
    handle: "",
    profileUrl: "",
  });

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}/platforms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Add failed");
      const d = json.data;
      if (d.populated) {
        toast.success(
          `Channel added — pulled ${d.followers?.toLocaleString() ?? "?"} followers, ${d.newPosts} posts`,
        );
      } else {
        toast.success(
          `Channel added. Content will populate on the next refresh${
            d.reason ? ` (${d.reason})` : ""
          }.`,
        );
      }
      setForm({ platform: "yt", handle: "", profileUrl: "" });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
      >
        + Add channel
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <select
        value={form.platform}
        onChange={(e) => setForm({ ...form, platform: e.target.value })}
        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
      >
        <option value="yt">YouTube</option>
        <option value="ig">Instagram</option>
        <option value="tt">TikTok</option>
      </select>
      <input
        autoFocus
        placeholder="@handle"
        value={form.handle}
        onChange={(e) => setForm({ ...form, handle: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && form.handle && submit()}
        className={`${inputCls} w-40`}
      />
      <input
        placeholder="https://profile-url (optional)"
        value={form.profileUrl}
        onChange={(e) => setForm({ ...form, profileUrl: e.target.value })}
        className={`${inputCls} w-56`}
      />
      <button
        onClick={submit}
        disabled={busy || !form.handle.trim()}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "Adding…" : "Add & fetch"}
      </button>
      <button
        onClick={() => setOpen(false)}
        disabled={busy}
        className="rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:text-zinc-800"
      >
        Cancel
      </button>
    </div>
  );
}
