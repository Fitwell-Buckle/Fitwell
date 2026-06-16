"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Star,
  Mic,
  CreditCard,
  Loader2,
  Play,
  ExternalLink,
  Gift,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDictation } from "@/components/ui/use-dictation";
import {
  VENDOR_SIDES,
  VENDOR_SIDE_LABELS,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_STATUS_LABELS,
  type VendorSide,
  type FollowUpStatus,
} from "@/lib/tradeshows/constants";
import { VoiceRecorder, type NewVoiceNote } from "./voice-recorder";

interface VendorData {
  id: string;
  booth: string | null;
  companyName: string;
  category: string | null;
  side: string;
  priority: boolean;
  visited: boolean;
  sampleGiven: boolean;
  contactName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  nextSteps: string | null;
  followUpStatus: string;
  cardImageUrl: string | null;
  seedNotes: string | null;
  responseRaw: string | null;
  meetingRaw: string | null;
  leadId: string | null;
  supplierLeadId: string | null;
}

export function VendorDetail({
  showId,
  showName,
  vendor: initial,
  voiceNotes: initialNotes,
}: {
  showId: string;
  showName: string;
  vendor: VendorData;
  voiceNotes: NewVoiceNote[];
}) {
  const router = useRouter();
  const [vendor, setVendor] = useState(initial);
  const [notes, setVoiceNotes] = useState(initialNotes);
  const [savingContact, setSavingContact] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promoting, setPromoting] = useState<"supplier" | "customer" | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const base = `/api/trade-shows/${showId}/vendors/${vendor.id}`;

  function set<K extends keyof VendorData>(key: K, value: VendorData[K]) {
    setVendor((v) => ({ ...v, [key]: value }));
  }

  async function patch(fields: Partial<VendorData>): Promise<boolean> {
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    return res.ok;
  }

  async function toggleVisited() {
    const next = !vendor.visited;
    set("visited", next);
    if (!(await patch({ visited: next }))) {
      set("visited", !next);
      toast.error("Couldn't update");
    }
  }

  async function toggleSample() {
    const next = !vendor.sampleGiven;
    set("sampleGiven", next);
    if (!(await patch({ sampleGiven: next }))) {
      set("sampleGiven", !next);
      toast.error("Couldn't update");
    }
  }

  async function changeSide(next: VendorSide) {
    const prev = vendor.side;
    set("side", next);
    if (!(await patch({ side: next }))) {
      set("side", prev);
      toast.error("Couldn't update");
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete ${vendor.companyName} from this show? This can't be undone.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(base, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Vendor deleted");
      router.push(`/trade-shows/${showId}`);
    } catch {
      setDeleting(false);
      toast.error("Couldn't delete");
    }
  }

  async function saveContact() {
    setSavingContact(true);
    const ok = await patch({
      contactName: vendor.contactName,
      title: vendor.title,
      email: vendor.email,
      phone: vendor.phone,
      website: vendor.website,
      notes: vendor.notes,
    });
    setSavingContact(false);
    toast[ok ? "success" : "error"](ok ? "Saved" : "Save failed");
  }

  async function saveFollowUp() {
    setSavingFollowUp(true);
    const ok = await patch({
      followUpStatus: vendor.followUpStatus,
      nextSteps: vendor.nextSteps,
    });
    setSavingFollowUp(false);
    toast[ok ? "success" : "error"](ok ? "Saved" : "Save failed");
  }

  async function onScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${base}/scan-card`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Scan failed");
      const d = json.data as {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        cardImageUrl: string;
        cardRawText?: string;
        confidence?: Record<string, number>;
      };
      const scannedName =
        [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || null;
      // Fill empty fields from the scan; never clobber what's already there.
      const next: Partial<VendorData> = {
        cardImageUrl: d.cardImageUrl,
        contactName: vendor.contactName || scannedName,
        email: vendor.email || d.email,
        phone: vendor.phone || d.phone,
        title: vendor.title || d.title,
      };
      await patch({
        ...next,
        ...({
          cardRawText: d.cardRawText ?? null,
          ocrConfidence: d.confidence ?? null,
        } as Partial<VendorData>),
      });
      setVendor((v) => ({ ...v, ...next }));
      toast.success("Card scanned — review the details");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function promote(target: "supplier" | "customer") {
    setPromoting(target);
    try {
      const res = await fetch(`${base}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Promote failed");
      if (target === "supplier")
        set("supplierLeadId", json.data.supplierLeadId);
      else set("leadId", json.data.leadId);
      toast.success(
        target === "supplier"
          ? "Added to Supplier Leads"
          : "Added to Customer Leads",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <Link
        href={`/trade-shows/${showId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> {showName}
      </Link>

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {vendor.priority && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            )}
            <h1 className="truncate text-xl font-semibold text-zinc-900">
              {vendor.companyName}
            </h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            {vendor.booth && (
              <span className="font-mono text-zinc-700">
                Booth {vendor.booth}
              </span>
            )}
            {vendor.category && <span>{vendor.category}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          aria-label="Delete vendor"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Quick capture: visited / sample / side */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleVisited}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            vendor.visited
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
          )}
        >
          <Check className="h-4 w-4" />
          {vendor.visited ? "Visited" : "Mark visited"}
        </button>
        <button
          type="button"
          onClick={toggleSample}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            vendor.sampleGiven
              ? "border-violet-500 bg-violet-500 text-white"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
          )}
        >
          <Gift className="h-4 w-4" />
          {vendor.sampleGiven ? "Sample given" : "Gave a sample?"}
        </button>
        <div className="ml-auto inline-flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Type</span>
          <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5">
            {VENDOR_SIDES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeSide(s)}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  vendor.side === s
                    ? "bg-brand text-white"
                    : "text-zinc-600 hover:bg-zinc-50",
                )}
              >
                {VENDOR_SIDE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Seed intel */}
      {(vendor.seedNotes || vendor.responseRaw || vendor.meetingRaw) && (
        <Card className="mt-4 bg-zinc-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Pre-show intel
          </h2>
          {vendor.seedNotes && (
            <p className="mt-1.5 text-sm text-zinc-700">{vendor.seedNotes}</p>
          )}
          {(vendor.responseRaw || vendor.meetingRaw) && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-zinc-500">
              {vendor.responseRaw && <span>Response: {vendor.responseRaw}</span>}
              {vendor.meetingRaw && <span>Meeting: {vendor.meetingRaw}</span>}
            </div>
          )}
        </Card>
      )}

      {/* Business card */}
      <Section title="Business card">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onScanFile}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
          >
            {scanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            {vendor.cardImageUrl ? "Re-scan card" : "Scan business card"}
          </Button>
        </div>
        {vendor.cardImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.cardImageUrl}
            alt="Business card"
            className="mt-3 max-h-48 rounded-md border border-zinc-200"
          />
        )}
      </Section>

      {/* Contact */}
      <Section title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Contact name"
            value={vendor.contactName}
            onChange={(v) => set("contactName", v)}
          />
          <Field
            label="Title"
            value={vendor.title}
            onChange={(v) => set("title", v)}
          />
          <Field
            label="Email"
            type="email"
            value={vendor.email}
            onChange={(v) => set("email", v)}
          />
          <Field
            label="Phone"
            value={vendor.phone}
            onChange={(v) => set("phone", v)}
          />
          <Field
            label="Website"
            value={vendor.website}
            onChange={(v) => set("website", v)}
            className="sm:col-span-2"
          />
        </div>
        <DictationTextarea
          label="Booth notes"
          value={vendor.notes ?? ""}
          onChange={(v) => set("notes", v)}
          placeholder="What did you discuss? Capabilities, pricing, fit…"
        />
        <Button
          className="mt-3"
          onClick={saveContact}
          disabled={savingContact}
        >
          {savingContact && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </Section>

      {/* Voice notes */}
      <Section title="Voice notes">
        <VoiceRecorder
          uploadUrl={`${base}/voice-notes`}
          onUploaded={(n) => setVoiceNotes((list) => [n, ...list])}
        />
        <div className="mt-3 space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-zinc-400">No voice notes yet.</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className="rounded-md border border-zinc-200 p-3"
              >
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Mic className="h-3.5 w-3.5" />
                  <span>{new Date(n.createdAt).toLocaleString("en-US")}</span>
                  {n.durationSec != null && (
                    <span>· {Math.round(n.durationSec)}s</span>
                  )}
                </div>
                <audio
                  controls
                  src={n.blobUrl}
                  className="mt-2 h-9 w-full"
                  preload="none"
                >
                  <track kind="captions" />
                </audio>
                {n.transcript && (
                  <p className="mt-2 text-sm text-zinc-700">{n.transcript}</p>
                )}
                {!n.transcript && (
                  <a
                    href={n.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    <Play className="h-3 w-3" /> open audio
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </Section>

      {/* Follow-up */}
      <Section title="Follow-up">
        <label className="text-xs font-medium text-zinc-500">Status</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {FOLLOW_UP_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set("followUpStatus", s)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm transition-colors",
                vendor.followUpStatus === s
                  ? "border-brand bg-brand text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {FOLLOW_UP_STATUS_LABELS[s as FollowUpStatus]}
            </button>
          ))}
        </div>
        <DictationTextarea
          label="Next steps"
          value={vendor.nextSteps ?? ""}
          onChange={(v) => set("nextSteps", v)}
          placeholder="Send sample pack, email pricing, book a call…"
        />
        <Button
          className="mt-3"
          onClick={saveFollowUp}
          disabled={savingFollowUp}
        >
          {savingFollowUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </Section>

      {/* Promote into pipelines — both options are always available; many
          booths are a fit for both directions. */}
      <Section title="Add to pipeline">
        <div className="space-y-3">
          <PipelineRow
            label="Supplier Leads"
            hint="A manufacturer we'd buy from"
            linkedHref={
              vendor.supplierLeadId
                ? `/modules/production/supplier-leads/${vendor.supplierLeadId}`
                : null
            }
            busy={promoting === "supplier"}
            onPromote={() => promote("supplier")}
          />
          <PipelineRow
            label="Customer Leads"
            hint="A brand we'd sell buckles to"
            linkedHref={vendor.leadId ? `/leads/${vendor.leadId}` : null}
            busy={promoting === "customer"}
            onPromote={() => promote("customer")}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-900">{title}</h2>
      <Card className="p-4">{children}</Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-zinc-500">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
      />
    </div>
  );
}

// Textarea with a push-to-dictate mic (reuses the Web Speech API hook).
function DictationTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const dictation = useDictation(onChange, () => value);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-500">{label}</label>
        {dictation.supported && (
          <button
            type="button"
            onClick={dictation.toggle}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
              dictation.listening
                ? "bg-red-50 text-red-600"
                : "text-zinc-400 hover:text-zinc-600",
            )}
          >
            <Mic className="h-3.5 w-3.5" />
            {dictation.listening ? "Listening…" : "Dictate"}
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
      />
    </div>
  );
}

function PipelineRow({
  label,
  hint,
  linkedHref,
  busy,
  onPromote,
}: {
  label: string;
  hint: string;
  linkedHref: string | null;
  busy: boolean;
  onPromote: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-zinc-900">{label}</div>
        <div className="text-xs text-zinc-500">{hint}</div>
      </div>
      {linkedHref ? (
        <Link
          href={linkedHref}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <Check className="h-3.5 w-3.5" /> Linked
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <Button variant="outline" onClick={onPromote} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Convert
        </Button>
      )}
    </div>
  );
}
