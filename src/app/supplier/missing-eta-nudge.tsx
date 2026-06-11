"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface MissingEtaPo {
  poId: string;
  poNumber: string;
  missingCount: number;
}

/**
 * Login-time nudge. When the signed-in supplier still has line items without a
 * Final ETA, pop a modal on the dashboard listing those POs (each linked to its
 * detail page, where the Final ETA column lives) so they go fill the dates in.
 * Shown once per browser session — dismissing persists in sessionStorage, so a
 * fresh login re-nags until every line has an ETA (the list shrinks to empty
 * and the nudge stops on its own).
 */
export function MissingEtaNudge({ pos }: { pos: MissingEtaPo[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pos.length === 0) return;
    try {
      if (sessionStorage.getItem("fitwell-eta-nudge-dismissed") === "1") return;
    } catch {
      /* sessionStorage unavailable — show it anyway */
    }
    setOpen(true);
  }, [pos.length]);

  function dismiss() {
    try {
      sessionStorage.setItem("fitwell-eta-nudge-dismissed", "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (pos.length === 0) return null;

  const totalMissing = pos.reduce((s, p) => s + p.missingCount, 0);
  const firstPo = pos[0];

  return (
    <Modal
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : dismiss())}
      title="Add your delivery ETAs"
      description={`${totalMissing} line item${totalMissing === 1 ? "" : "s"} across ${pos.length} PO${pos.length === 1 ? "" : "s"} still need an expected delivery date.`}
    >
      <p className="text-sm text-zinc-600">
        Open a PO and set the{" "}
        <span className="font-medium text-zinc-900">Final ETA</span> for each
        line item in the Line items table.
      </p>
      <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto">
        {pos.map((p) => (
          <li key={p.poId}>
            <Link
              href={`/supplier/po/${p.poId}`}
              onClick={dismiss}
              className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 text-sm hover:border-zinc-200 hover:bg-zinc-50"
            >
              <span className="font-mono font-medium text-zinc-900">
                {p.poNumber}
              </span>
              <span className="text-xs font-medium text-amber-600">
                {p.missingCount} ETA{p.missingCount === 1 ? "" : "s"} to set
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Later
        </Button>
        <Button size="sm" asChild>
          <Link href={`/supplier/po/${firstPo.poId}`} onClick={dismiss}>
            Set ETAs now
          </Link>
        </Button>
      </div>
    </Modal>
  );
}
