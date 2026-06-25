"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ReferenceItem {
  id: string;
  url: string;
  embedUrl: string | null;
  title: string | null;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

function ReferenceCard({
  reference,
  onRemove,
  busy,
}: {
  reference: ReferenceItem;
  onRemove: (id: string) => void;
  busy: boolean;
}) {
  const label = reference.title || "Fusion design";
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2">
        <a
          href={reference.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-800 hover:text-zinc-950"
        >
          <Box className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="truncate underline decoration-zinc-300 underline-offset-2">
            {label}
          </span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label="Remove reference"
          onClick={() => onRemove(reference.id)}
          className="shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {reference.embedUrl ? (
        <iframe
          src={reference.embedUrl}
          title={label}
          loading="lazy"
          allowFullScreen
          className="h-[34rem] w-full border-0 bg-zinc-50"
        />
      ) : (
        <div className="px-3 py-6 text-sm text-zinc-500">
          Couldn&apos;t load an inline preview for this link.{" "}
          <a
            href={reference.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
          >
            Open in Fusion
          </a>
          .
        </div>
      )}
    </div>
  );
}

export function FusionReferences({
  prototypeId,
  references,
}: {
  prototypeId: string;
  references: ReferenceItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!url.trim()) return setError("Paste a Fusion share link.");
    setBusy(true);
    try {
      const res = await fetch(`/api/prototypes/${prototypeId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Could not add link.");
        return;
      }
      setUrl("");
      setTitle("");
      setAdding(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prototypes/references/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Delete failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">CAD references</h2>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" /> Add Fusion link
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Paste an Autodesk Fusion share link (e.g. a360.co/…). The model renders
        inline as an interactive 3D preview.
      </p>

      {adding && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={fieldLabel}>Fusion share link</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://a360.co/…"
              />
            </div>
            <div>
              <label className={fieldLabel}>Label (optional)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Body v2"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={add} disabled={busy}>
              {busy ? "Adding…" : "Add link"}
            </Button>
          </div>
        </div>
      )}

      {!adding && error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-4">
        {references.length === 0 ? (
          <p className="text-sm text-zinc-400">No CAD references yet.</p>
        ) : (
          references.map((r) => (
            <ReferenceCard
              key={r.id}
              reference={r}
              onRemove={remove}
              busy={busy}
            />
          ))
        )}
      </div>
    </Card>
  );
}
