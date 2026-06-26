"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EDITABLE_IDEA_STATUSES,
  IDEA_STATUS_BADGE,
  IDEA_STATUS_LABELS,
  compareIdeasForList,
  iceScore,
  type IdeaStatus,
} from "@/lib/product-ideas";
import { cn } from "@/lib/utils";

export interface IdeaItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  notes: string | null;
  promotedPrototypeId: string | null;
  promotedPrototypeName: string | null;
  createdAtMs: number;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const selectCls =
  "h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={fieldLabel}>{label} (1–10)</label>
      <Input
        type="number"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function IdeaForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: IdeaItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "idea");
  const [impact, setImpact] = useState(
    initial?.impact == null ? "" : String(initial.impact),
  );
  const [confidence, setConfidence] = useState(
    initial?.confidence == null ? "" : String(initial.confidence),
  );
  const [ease, setEase] = useState(
    initial?.ease == null ? "" : String(initial.ease),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intOrNull = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
  // "promoted" can't be set here — it comes from the promote action.
  const statusForSave = editing && status === "promoted" ? undefined : status;

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        ...(statusForSave ? { status: statusForSave } : {}),
        impact: intOrNull(impact),
        confidence: intOrNull(confidence),
        ease: intOrNull(ease),
      };
      const res = await fetch(
        editing ? `/api/product-ideas/${initial!.id}` : "/api/product-ideas",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Idea</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quick-release deployant clasp"
          />
        </div>
        {editing && (
          <div>
            <label className={fieldLabel}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={cn(selectCls, "h-9 w-full text-sm")}
              disabled={status === "promoted"}
            >
              {(status === "promoted"
                ? (["promoted"] as IdeaStatus[])
                : EDITABLE_IDEA_STATUSES
              ).map((s) => (
                <option key={s} value={s}>
                  {IDEA_STATUS_LABELS[s as IdeaStatus]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={fieldLabel}>Concept (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="The problem, the rough idea, who it's for…"
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <ScoreInput label="Impact" value={impact} onChange={setImpact} />
          <ScoreInput
            label="Confidence"
            value={confidence}
            onChange={setConfidence}
          />
          <ScoreInput label="Ease" value={ease} onChange={setEase} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save" : "Add idea"}
        </Button>
      </div>
    </div>
  );
}

function IdeaRow({ idea }: { idea: IdeaItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = iceScore(idea);
  const promoted = idea.status === "promoted";

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-ideas/${idea.id}/promote`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Promote failed.");
      router.push(`/modules/production/prototypes/${d.data.prototypeId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promote failed.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-ideas/${idea.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Delete failed.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="py-2">
        <IdeaForm
          initial={idea}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 py-2.5 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-900">{idea.name}</span>
          <Badge className={IDEA_STATUS_BADGE[idea.status as IdeaStatus] ?? "bg-zinc-100 text-zinc-600"}>
            {IDEA_STATUS_LABELS[idea.status as IdeaStatus] ?? idea.status}
          </Badge>
          {score != null && (
            <span
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
              title={`Impact ${idea.impact} × Confidence ${idea.confidence} × Ease ${idea.ease}`}
            >
              ICE {score}
            </span>
          )}
          {promoted && idea.promotedPrototypeId && (
            <Link
              href={`/modules/production/prototypes/${idea.promotedPrototypeId}`}
              className="text-xs text-violet-700 underline decoration-violet-300 underline-offset-2 hover:decoration-violet-600"
            >
              → {idea.promotedPrototypeName ?? "prototype"}
            </Link>
          )}
        </div>
        {idea.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
            {idea.description}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs">
        {!promoted && (
          <select
            value={idea.status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={busy}
            className={selectCls}
            aria-label="Status"
          >
            {EDITABLE_IDEA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {IDEA_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        {!promoted && (
          <button
            type="button"
            onClick={promote}
            disabled={busy}
            className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:decoration-violet-600 disabled:opacity-50"
          >
            Promote
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-zinc-400 underline decoration-zinc-300 underline-offset-2 hover:text-red-600 hover:decoration-red-400 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function ProductIdeasManager({ ideas }: { ideas: IdeaItem[] }) {
  const [creating, setCreating] = useState(false);
  const sorted = [...ideas].sort(compareIdeasForList);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Product ideas</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Rough concepts, scored by ICE (impact × confidence × ease). Promote
            the strong ones to a prototype.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            Add idea
          </Button>
        )}
      </div>

      {creating && (
        <div className="mt-4">
          <IdeaForm
            onSaved={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <div className="mt-4">
        {sorted.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-400">
            No product ideas yet. Capture rough concepts here before they become
            prototypes.
          </p>
        ) : (
          sorted.map((idea) => <IdeaRow key={idea.id} idea={idea} />)
        )}
      </div>
    </Card>
  );
}
