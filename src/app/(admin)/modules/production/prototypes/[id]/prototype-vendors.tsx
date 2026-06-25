"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VendorInlineCreate } from "@/components/production/vendor-inline-create";

export interface CandidateVendor {
  id: string; // supplierId
  name: string;
  contactEmail: string | null;
  rfqSentAt: string | null;
  quote: {
    unitCostCents: number | null;
    leadTimeDays: number | null;
    moq: number | null;
    setupCostCents: number | null;
    notes: string | null;
    receivedAt: string | null;
  };
}

interface SupplierOption {
  id: string;
  name: string;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";
const inputCls =
  "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950";

function fmtMoney(cents: number | null): string {
  return cents == null ? "—" : `$${(cents / 100).toFixed(2)}`;
}
function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
function dollarsToCents(v: string): number | null {
  return v.trim() === "" ? null : Math.round(Number(v) * 100);
}
function intOrNull(v: string): number | null {
  return v.trim() === "" ? null : Math.round(Number(v));
}

function statusOf(v: CandidateVendor): "quoted" | "requested" | "candidate" {
  if (v.quote.receivedAt) return "quoted";
  if (v.rfqSentAt) return "requested";
  return "candidate";
}

// ── Send RFQ (per-vendor; reuses the PO email path server-side) ──────────────
function RfqForm({
  prototypeId,
  vendor,
  onDone,
}: {
  prototypeId: string;
  vendor: CandidateVendor;
  onDone: () => void;
}) {
  const router = useRouter();
  const [to, setTo] = useState(vendor.contactEmail ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    if (!to.trim()) return setError("Add a recipient email.");
    setBusy(true);
    try {
      const res = await fetch(
        `/api/prototypes/${prototypeId}/suppliers/${vendor.id}/rfq`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: to.trim(),
            message: message.trim() || null,
          }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Send failed.");
        setBusy(false);
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-600">
        Send request for quote
      </p>
      <div className="space-y-2">
        <div>
          <label className={fieldLabel}>To</label>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="rfq@vendor.com"
          />
        </div>
        <div>
          <label className={fieldLabel}>Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Target volume, terms, or anything else to include…"
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        Includes the prototype spec and CAD links. CC&apos;s you and the
        vendor&apos;s other contacts; replies come to you.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={send} disabled={busy}>
          {busy ? "Sending…" : "Send RFQ"}
        </Button>
      </div>
    </div>
  );
}

// ── Record / edit a received quote ───────────────────────────────────────────
function QuoteForm({
  prototypeId,
  vendor,
  onDone,
}: {
  prototypeId: string;
  vendor: CandidateVendor;
  onDone: () => void;
}) {
  const router = useRouter();
  const [unit, setUnit] = useState(centsToInput(vendor.quote.unitCostCents));
  const [lead, setLead] = useState(
    vendor.quote.leadTimeDays == null ? "" : String(vendor.quote.leadTimeDays),
  );
  const [moq, setMoq] = useState(
    vendor.quote.moq == null ? "" : String(vendor.quote.moq),
  );
  const [setup, setSetup] = useState(centsToInput(vendor.quote.setupCostCents));
  const [notes, setNotes] = useState(vendor.quote.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/prototypes/${prototypeId}/suppliers/${vendor.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitCostCents: dollarsToCents(unit),
            leadTimeDays: intOrNull(lead),
            moq: intOrNull(moq),
            setupCostCents: dollarsToCents(setup),
            notes: notes.trim() || null,
          }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Save failed.");
        setBusy(false);
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-600">
        {vendor.quote.receivedAt ? "Edit quote" : "Record quote"}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={fieldLabel}>Unit price ($)</label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldLabel}>Lead time (days)</label>
          <Input
            type="number"
            min={0}
            value={lead}
            onChange={(e) => setLead(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldLabel}>MOQ</label>
          <Input
            type="number"
            min={0}
            value={moq}
            onChange={(e) => setMoq(e.target.value)}
          />
        </div>
        <div>
          <label className={fieldLabel}>Tooling/sample ($)</label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={setup}
            onChange={(e) => setSetup(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-2">
        <label className={fieldLabel}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Terms, validity, caveats…"
          className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save quote"}
        </Button>
      </div>
    </div>
  );
}

function StatusChip({
  status,
  rfqSentAt,
}: {
  status: ReturnType<typeof statusOf>;
  rfqSentAt: string | null;
}) {
  if (status === "quoted") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700">
        Quoted
      </span>
    );
  }
  if (status === "requested") {
    return (
      <span
        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"
        title={rfqSentAt ? `Sent ${new Date(rfqSentAt).toLocaleDateString()}` : undefined}
      >
        RFQ sent
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
      Candidate
    </span>
  );
}

export function PrototypeVendors({
  prototypeId,
  vendors,
  awardedId,
  allSuppliers,
}: {
  prototypeId: string;
  vendors: CandidateVendor[];
  awardedId: string | null;
  allSuppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickId, setPickId] = useState("");
  // Which vendor has its RFQ / quote panel open (by supplierId), if any.
  const [rfqFor, setRfqFor] = useState<string | null>(null);
  const [quoteFor, setQuoteFor] = useState<string | null>(null);

  const added = new Set(vendors.map((v) => v.id));
  const available = allSuppliers.filter((s) => !added.has(s.id));

  // Lowest quoted unit price, to highlight the best offer for comparison.
  const lowest = vendors
    .map((v) => v.quote.unitCostCents)
    .filter((c): c is number => c != null)
    .sort((a, b) => a - b)[0];

  async function mutate(method: "POST" | "DELETE", supplierId: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/prototypes/${prototypeId}/suppliers`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Request failed.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Vendors &amp; quotes</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Request quotes from each candidate vendor (sent via our email system), or
        record quotes you got back another way. The lowest unit price is
        highlighted.
      </p>

      <div className="mt-4 space-y-2">
        {vendors.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500">
            No vendors yet.
          </p>
        ) : (
          vendors.map((v) => {
            const status = statusOf(v);
            const isLowest =
              v.quote.unitCostCents != null &&
              lowest != null &&
              v.quote.unitCostCents === lowest;
            return (
              <div
                key={v.id}
                className="rounded-md border border-zinc-200 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-800">
                      {v.name}
                    </span>
                    {v.id === awardedId && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-green-600">
                        awarded
                      </span>
                    )}
                    <StatusChip status={status} rfqSentAt={v.rfqSentAt} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {rfqFor !== v.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuoteFor(null);
                          setRfqFor(v.id);
                        }}
                        disabled={busy}
                        className="text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                      >
                        {v.rfqSentAt ? "Resend RFQ" : "Send RFQ"}
                      </button>
                    )}
                    {quoteFor !== v.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setRfqFor(null);
                          setQuoteFor(v.id);
                        }}
                        disabled={busy}
                        className="text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                      >
                        {v.quote.receivedAt ? "Edit quote" : "Record quote"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => mutate("DELETE", v.id)}
                      disabled={busy}
                      className="text-zinc-400 underline decoration-zinc-300 underline-offset-2 hover:text-red-600 hover:decoration-red-400 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Quote summary */}
                {v.quote.receivedAt && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                    <span
                      className={
                        isLowest ? "font-semibold text-green-700" : "font-medium text-zinc-800"
                      }
                    >
                      {fmtMoney(v.quote.unitCostCents)}/unit
                      {isLowest && (
                        <span className="ml-1 text-[10px] uppercase">lowest</span>
                      )}
                    </span>
                    {v.quote.leadTimeDays != null && (
                      <span>{v.quote.leadTimeDays}d lead</span>
                    )}
                    {v.quote.moq != null && <span>MOQ {v.quote.moq}</span>}
                    {v.quote.setupCostCents != null && (
                      <span>{fmtMoney(v.quote.setupCostCents)} tooling</span>
                    )}
                    {v.quote.notes && (
                      <span className="text-zinc-400">· {v.quote.notes}</span>
                    )}
                  </div>
                )}

                {rfqFor === v.id && (
                  <RfqForm
                    prototypeId={prototypeId}
                    vendor={v}
                    onDone={() => setRfqFor(null)}
                  />
                )}
                {quoteFor === v.id && (
                  <QuoteForm
                    prototypeId={prototypeId}
                    vendor={v}
                    onDone={() => setQuoteFor(null)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-3">
        {available.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={fieldLabel}>Add an existing vendor</label>
              <select
                value={pickId}
                onChange={(e) => setPickId(e.target.value)}
                className={inputCls}
                disabled={busy}
              >
                <option value="">— Choose a vendor —</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !pickId}
              onClick={() => {
                const sid = pickId;
                setPickId("");
                mutate("POST", sid);
              }}
            >
              Add
            </Button>
          </div>
        )}

        {adding ? (
          <VendorInlineCreate
            onCreated={(v) => {
              setAdding(false);
              mutate("POST", v.id);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
          >
            + Create a new vendor
          </button>
        )}
      </div>
    </Card>
  );
}
