"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/ui/delete-button";
import { InvoiceAttachments } from "@/components/invoicing/invoice-attachments";
import {
  ROUND_STATUSES,
  ROUND_STATUS_BADGE,
  ROUND_STATUS_LABELS,
  type RoundStatus,
} from "@/lib/prototypes";

export interface RoundItem {
  id: string;
  roundNumber: number;
  status: string;
  requestedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  sampleQty: number | null;
  unitCostCents: number | null;
  feedback: string | null;
  attachments: {
    id: string;
    blobUrl: string;
    filename: string;
    sizeBytes: number | null;
  }[];
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputCls =
  "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950";

function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function RoundCard({ round }: { round: RoundItem }) {
  const router = useRouter();
  const [status, setStatus] = useState(round.status);
  const [requestedAt, setRequestedAt] = useState(round.requestedAt ?? "");
  const [expectedAt, setExpectedAt] = useState(round.expectedAt ?? "");
  const [receivedAt, setReceivedAt] = useState(round.receivedAt ?? "");
  const [sampleQty, setSampleQty] = useState(
    round.sampleQty == null ? "" : String(round.sampleQty),
  );
  const [unitCost, setUnitCost] = useState(centsToInput(round.unitCostCents));
  const [feedback, setFeedback] = useState(round.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/prototypes/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          requestedAt: requestedAt || null,
          expectedAt: expectedAt || null,
          receivedAt: receivedAt || null,
          sampleQty: sampleQty.trim() === "" ? null : Number(sampleQty),
          unitCostCents:
            unitCost.trim() === "" ? null : Math.round(Number(unitCost) * 100),
          feedback: feedback.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Save failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const badgeCls =
    ROUND_STATUS_BADGE[status as RoundStatus] ?? "bg-zinc-100 text-zinc-600";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            Round {round.roundNumber}
          </h3>
          <Badge className={badgeCls}>
            {ROUND_STATUS_LABELS[status as RoundStatus] ?? status}
          </Badge>
        </div>
        <DeleteButton
          entityKind="round"
          entityLabel={`Round ${round.roundNumber}`}
          deleteUrl={`/api/prototypes/rounds/${round.id}`}
          iconOnly
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={fieldLabel}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputCls}
          >
            {ROUND_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ROUND_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Sample qty</label>
          <Input
            type="number"
            min={0}
            value={sampleQty}
            onChange={(e) => setSampleQty(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldLabel}>Unit cost ($)</label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldLabel}>Requested</label>
          <input
            type="date"
            value={requestedAt}
            onChange={(e) => setRequestedAt(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={fieldLabel}>Expected</label>
          <input
            type="date"
            value={expectedAt}
            onChange={(e) => setExpectedAt(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={fieldLabel}>Received</label>
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-3">
          <label className={fieldLabel}>Feedback / changes for next round</label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save round"}
        </Button>
      </div>

      <div className="mt-2">
        <InvoiceAttachments
          uploadUrl={`/api/prototypes/rounds/${round.id}/attachments`}
          deleteUrlBase="/api/prototypes/attachments"
          attachments={round.attachments}
          title="Sample photos"
          buttonLabel="Add photo"
          hint="Photos of this round's samples. Images or PDF, max 10MB."
        />
      </div>
    </Card>
  );
}

export function PrototypeRounds({
  prototypeId,
  rounds,
}: {
  prototypeId: string;
  rounds: RoundItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addRound() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/prototypes/${prototypeId}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "requested" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Could not add round.");
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
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Sample rounds</h2>
        <Button size="sm" variant="outline" onClick={addRound} disabled={busy}>
          <Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add round"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 space-y-4">
        {rounds.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No sample rounds yet. Add the first round when you request samples
            from the vendor.
          </p>
        ) : (
          rounds.map((r) => <RoundCard key={r.id} round={r} />)
        )}
      </div>
    </div>
  );
}
