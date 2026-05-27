"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { STAGE_LABELS, type ProductionStage } from "@/lib/production/stages";

// "Setup" on the Production Summary page → rename the fixed production stages.
// The pipeline itself is unchanged; only the display labels are overridden.
// Clearing a field reverts that stage to its default name.
export function StageSetup({
  stages,
}: {
  stages: { stage: ProductionStage; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(stages.map((s) => [s.stage, s.label])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/production/stage-labels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: values }),
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
        description="Rename the production stages. Leave a field blank to use its default name."
      >
        <div className="space-y-2">
          {stages.map((s) => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-xs text-zinc-400">
                {stages.indexOf(s) + 1}.
              </span>
              <Input
                value={values[s.stage] ?? ""}
                placeholder={STAGE_LABELS[s.stage]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [s.stage]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
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
