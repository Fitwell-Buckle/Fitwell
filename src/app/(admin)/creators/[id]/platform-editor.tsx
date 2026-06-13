"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400";

export interface PlatformEditorProps {
  creatorId: string;
  creatorName: string;
  platform: {
    id: string;
    platform: string;
    handle: string;
    profileUrl: string | null;
    bio: string | null;
    isVerified: boolean | null;
  };
  /** True when this is the creator's only platform — splitting/deleting it
   * empties the creator, so we warn. */
  isOnlyPlatform: boolean;
}

type SearchHit = {
  id: string;
  name: string;
  platforms: string[];
};

export function PlatformEditor({
  creatorId,
  creatorName,
  platform,
  isOnlyPlatform,
}: PlatformEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    platform: platform.platform,
    handle: platform.handle,
    profileUrl: platform.profileUrl ?? "",
    bio: platform.bio ?? "",
    isVerified: platform.isVerified ?? false,
  });

  // Reassign picker state
  const [reassigning, setReassigning] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  const base = `/api/admin/creators/${creatorId}/platforms/${platform.id}`;

  async function send(
    url: string,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<unknown | null> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      return json.data ?? {};
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const ok = await send(base, "PATCH", {
      platform: form.platform,
      handle: form.handle,
      profileUrl: form.profileUrl || null,
      bio: form.bio || null,
      isVerified: form.isVerified,
    });
    if (ok) {
      toast.success("Platform updated");
      setOpen(false);
      router.refresh();
    }
  }

  async function del() {
    if (
      !confirm(
        isOnlyPlatform
          ? `Delete the only platform on "${creatorName}"? The creator will have no platforms left.`
          : `Delete @${platform.handle} (${platform.platform})? Its stats and posts are removed too.`,
      )
    )
      return;
    const ok = await send(base, "DELETE");
    if (ok) {
      toast.success("Platform removed");
      router.refresh();
    }
  }

  async function split() {
    if (
      !confirm(
        `Split @${platform.handle} (${platform.platform}) off onto its own new creator? Use this when it's actually a different person/brand than "${creatorName}".`,
      )
    )
      return;
    const data = (await send(`${base}/move`, "POST", {})) as {
      creatorId?: string;
    } | null;
    if (data) {
      toast.success("Split into a new creator");
      if (data.creatorId) router.push(`/creators/${data.creatorId}`);
      else router.refresh();
    }
  }

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/creators/search?q=${encodeURIComponent(q)}&exclude=${creatorId}`,
      );
      const json = await res.json();
      setHits(json.data ?? []);
    } catch {
      setHits([]);
    }
  }

  async function reassignTo(targetId: string, targetName: string) {
    if (!confirm(`Move @${platform.handle} onto "${targetName}"?`)) return;
    const ok = await send(`${base}/move`, "POST", { targetCreatorId: targetId });
    if (ok) {
      toast.success(`Moved to ${targetName}`);
      router.push(`/creators/${targetId}`);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
      >
        Edit / fix
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={form.platform}
          onChange={(e) => setForm({ ...form, platform: e.target.value })}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm"
        >
          <option value="ig">IG</option>
          <option value="yt">YT</option>
          <option value="tt">TT</option>
        </select>
        <input
          value={form.handle}
          onChange={(e) => setForm({ ...form, handle: e.target.value })}
          placeholder="handle"
          className={`${inputCls} w-40`}
        />
        <label className="flex items-center gap-1 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={form.isVerified}
            onChange={(e) => setForm({ ...form, isVerified: e.target.checked })}
          />
          verified
        </label>
      </div>
      <input
        value={form.profileUrl}
        onChange={(e) => setForm({ ...form, profileUrl: e.target.value })}
        placeholder="https://profile-url"
        className={inputCls}
      />
      <textarea
        value={form.bio}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
        placeholder="bio"
        rows={2}
        className={inputCls}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-zinc-800"
        >
          Cancel
        </button>
        <span className="mx-1 h-4 w-px bg-zinc-200" />
        <button
          onClick={split}
          disabled={busy}
          className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"
          title="This platform is a different entity → split onto a new creator"
        >
          Split off →
        </button>
        <button
          onClick={() => setReassigning((v) => !v)}
          disabled={busy}
          className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-40"
        >
          Reassign…
        </button>
        <button
          onClick={del}
          disabled={busy}
          className="ml-auto rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {reassigning && (
        <div className="space-y-1 rounded-lg border border-sky-200 bg-white p-2">
          <input
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search a creator to move this platform onto…"
            className={inputCls}
            autoFocus
          />
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => reassignTo(h.id, h.name)}
              disabled={busy}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-sky-50"
            >
              <span className="font-medium">{h.name}</span>
              <span className="font-mono text-[11px] text-zinc-400">
                {h.platforms.join(" · ")}
              </span>
            </button>
          ))}
          {query.trim().length >= 2 && hits.length === 0 && (
            <p className="px-2 py-1 text-xs text-zinc-400">No matches.</p>
          )}
        </div>
      )}
    </div>
  );
}
