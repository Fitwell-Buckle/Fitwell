"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface Row {
  rid: string;
  key: string | null; // null = a brand-new stage
  label: string;
}

// "Setup" on the Production Summary page → add / rename / delete / reorder the
// production stages. The first stage opens POs + routes sub-POs; the last stage
// triggers the Shopify receive. Deleting a stage that still holds items prompts
// to move them forward or back; history is kept (soft delete).
export function StageSetup({
  stages,
  counts,
}: {
  stages: { key: string; label: string }[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    stages.map((s) => ({ rid: s.key, key: s.key, label: s.label })),
  );
  const [moves, setMoves] = useState<Record<string, "forward" | "back">>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setLabel(rid: string, label: string) {
    setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, label } : r)));
  }

  function reorder(index: number, dir: -1 | 1) {
    setRows((rs) => {
      const next = [...rs];
      const j = index + dir;
      if (j < 0 || j >= next.length) return rs;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function addRow() {
    setRows((rs) => [...rs, { rid: crypto.randomUUID(), key: null, label: "" }]);
  }

  function removeRow(rid: string) {
    setRows((rs) => rs.filter((r) => r.rid !== rid));
    setConfirmId(null);
  }

  function requestDelete(row: Row) {
    setError(null);
    if (rows.length <= 2) {
      setError("Keep at least two stages.");
      return;
    }
    // A stage with items in it needs a forward/back choice first.
    if (row.key && (counts[row.key] ?? 0) > 0) {
      setConfirmId(row.rid);
    } else {
      removeRow(row.rid);
    }
  }

  function confirmDelete(row: Row, dir: "forward" | "back") {
    if (row.key) setMoves((m) => ({ ...m, [row.key as string]: dir }));
    removeRow(row.rid);
  }

  async function save() {
    setError(null);
    const stagesPayload = rows.map((r) => ({ key: r.key, label: r.label.trim() }));
    if (stagesPayload.some((s) => !s.label)) {
      setError("Every stage needs a name.");
      return;
    }
    if (stagesPayload.length < 2) {
      setError("Keep at least two stages.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/production/stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: stagesPayload, moves }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save.");
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="h-4 w-4" />
        Setup
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Production stages"
        description="Add, rename, delete, or reorder. The first stage opens POs; the last triggers receiving into Shopify."
      >
        <div className="space-y-2">
          {rows.map((row, i) => {
            const count = row.key ? counts[row.key] ?? 0 : 0;
            return (
              <div key={row.rid} className="rounded-md border border-zinc-100 p-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-6 shrink-0 text-center text-xs text-zinc-400">
                    {i + 1}
                  </span>
                  <Input
                    value={row.label}
                    placeholder="Stage name"
                    onChange={(e) => setLabel(row.rid, e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => reorder(i, -1)}
                    className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === rows.length - 1}
                    onClick={() => reorder(i, 1)}
                    className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete stage"
                    onClick={() => requestDelete(row)}
                    className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {confirmId === row.rid && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-7 text-xs text-zinc-600">
                    <span>
                      {count} item{count === 1 ? "" : "s"} here — move them:
                    </span>
                    {i > 0 && (
                      <Button size="sm" variant="outline" onClick={() => confirmDelete(row, "back")}>
                        Back
                      </Button>
                    )}
                    {i < rows.length - 1 && (
                      <Button size="sm" variant="outline" onClick={() => confirmDelete(row, "forward")}>
                        Forward
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-2 flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <Plus className="h-4 w-4" />
          Add stage
        </button>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
