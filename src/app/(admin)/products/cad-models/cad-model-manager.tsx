"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Box, ExternalLink, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/ui/delete-button";
import { FinishViewer } from "@/components/cad/finish-viewer";

interface CadModelItem {
  id: string;
  name: string;
  fusionUrl: string | null;
  glbUrl: string | null;
  status: string;
  errorMessage: string | null;
  sourceFilename: string | null;
  triangleCount: number | null;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  awaiting_export: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_export: "waiting for Fusion export…",
};

function NewModelForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fusionUrl, setFusionUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    setBusy(true);
    try {
      const res = await fetch("/api/cad-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          fusionUrl: fusionUrl.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Save failed.");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">New CAD model</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 18MM M4 Extension"
          />
        </div>
        <div>
          <label className={fieldLabel}>Fusion link (optional)</label>
          <Input
            value={fusionUrl}
            onChange={(e) => setFusionUrl(e.target.value)}
            placeholder="https://a360.co/… (reference)"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Create the model, then upload its STL to generate the 3D web model.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </div>
    </Card>
  );
}

function ModelCard({ model }: { model: CadModelItem }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While a model is awaiting its Autodesk export email, nudge the processor
  // (admin-authed) and refresh every 15s so it completes within ~a minute of
  // the email landing — the 10-min cron is just a backstop. Stops once the
  // status changes (props update on refresh).
  useEffect(() => {
    if (model.status !== "awaiting_export") return;
    let active = true;
    const tick = async () => {
      try {
        await fetch("/api/cron/process-cad-exports");
      } catch {
        /* ignore; cron is the backstop */
      }
      if (active) router.refresh();
    };
    const interval = setInterval(tick, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [model.status, router]);

  async function generateFromFusion() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/cad-models/${model.id}/fusion-export`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Could not start the Fusion export.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadStl(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/cad-models/${model.id}/stl`, {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Conversion failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-900">
              {model.name}
            </h3>
            <Badge className={STATUS_BADGE[model.status] ?? STATUS_BADGE.draft}>
              {STATUS_LABEL[model.status] ?? model.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {model.sourceFilename
              ? `${model.sourceFilename}${
                  model.triangleCount
                    ? ` · ${model.triangleCount.toLocaleString()} tris`
                    : ""
                }`
              : "No STL uploaded yet"}
          </p>
          {model.fusionUrl && (
            <a
              href={model.fusionUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
            >
              Fusion link <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".stl,.obj"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadStl(f);
            }}
          />
          {model.fusionUrl && (
            <Button
              type="button"
              size="sm"
              disabled={busy || model.status === "awaiting_export"}
              onClick={generateFromFusion}
            >
              <Sparkles className="h-4 w-4" />
              {model.status === "awaiting_export"
                ? "Waiting…"
                : busy
                  ? "Starting…"
                  : "Generate from Fusion"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {model.glbUrl ? "Replace model" : "Upload model"}
          </Button>
          <DeleteButton
            entityKind="CAD model"
            entityLabel={model.name}
            deleteUrl={`/api/cad-models/${model.id}`}
            iconOnly
          />
        </div>
      </div>

      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}
      {model.status === "failed" && model.errorMessage && (
        <p className="px-4 pb-2 text-sm text-red-600">{model.errorMessage}</p>
      )}

      {model.glbUrl ? (
        <div className="border-t border-zinc-100 p-4">
          <FinishViewer src={model.glbUrl} alt={`${model.name} 3D model`} />
        </div>
      ) : (
        <div className="aspect-[16/9] w-full border-t border-zinc-100 bg-gradient-to-b from-zinc-50 to-zinc-100">
          {model.status === "awaiting_export" ? (
            <div className="flex h-full items-center justify-center text-amber-600">
              <Sparkles className="mr-2 h-5 w-5 animate-pulse" /> Waiting for the
              Autodesk export email, then converting automatically…
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">
              <Box className="mr-2 h-5 w-5" /> Generate from Fusion or upload an STL/OBJ
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function CadModelManager({ models }: { models: CadModelItem[] }) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = q
    ? models.filter((m) => m.name.toLowerCase().includes(q))
    : models;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter CAD models…"
          className="flex h-9 w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
        />
        {!adding && <Button onClick={() => setAdding(true)}>Add CAD model</Button>}
      </div>

      {adding && <NewModelForm onClose={() => setAdding(false)} />}

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400">
          {models.length === 0
            ? "No CAD models yet. Add one and upload its STL."
            : "No models match your search."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filtered.map((m) => (
            <ModelCard key={m.id} model={m} />
          ))}
        </div>
      )}
    </div>
  );
}
