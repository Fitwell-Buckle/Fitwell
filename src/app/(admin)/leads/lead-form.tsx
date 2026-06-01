"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LEAD_PERSONA_TAGS,
  LEAD_SOURCE_CHANNELS,
  LEAD_STAGES,
} from "@/lib/crm/constants";
import {
  personaLabel,
  sourceChannelLabel,
  stageLabel,
} from "@/lib/crm/display";

export interface LeadFormInitial {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  companyName?: string | null;
  website?: string | null;
  stage?: string;
  personaTag?: string | null;
  sourceChannel?: string;
  // YYYY-MM-DD. Defaults to today when not supplied.
  meetingDate?: string | null;
  // When set, the new lead will be linked to this company on save (FK).
  // Surfaced via the dedup-banner companion; the form itself doesn't pick.
  companyId?: string | null;
  notes?: string | null;
  cardImageUrl?: string | null;
  cardRawText?: string | null;
}

export interface LeadFormProps {
  initial?: LeadFormInitial;
  // OCR confidence per field, only set in photo-capture mode. Drives a small
  // colored indicator beside each input so the eye jumps to low-confidence
  // fields first.
  confidence?: Record<string, number | undefined>;
  submitLabel?: string;
  // Where to send the user after a successful save. Defaults to the new
  // lead's detail page.
  onSuccess?: (newLeadId: string) => void;
}

// Local YYYY-MM-DD for "today" (browser-local, so it matches the user's day).
function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const LBL = "block text-xs font-medium text-zinc-500";
const SEL =
  "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950";

function ConfidenceDot({ score }: { score: number | undefined }) {
  if (score === undefined) return null;
  const color =
    score >= 0.8
      ? "bg-emerald-500"
      : score >= 0.4
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      title={`Confidence ${Math.round(score * 100)}%`}
      aria-label={`Confidence ${Math.round(score * 100)} percent`}
    />
  );
}

function FieldLabel({
  htmlFor,
  children,
  confidence,
}: {
  htmlFor: string;
  children: React.ReactNode;
  confidence?: number;
}) {
  return (
    <label htmlFor={htmlFor} className={`${LBL} mb-1 flex items-center gap-1.5`}>
      {children}
      <ConfidenceDot score={confidence} />
    </label>
  );
}

export function LeadForm({
  initial,
  confidence,
  submitLabel = "Save lead",
  onSuccess,
}: LeadFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [stage, setStage] = useState(initial?.stage ?? "prospect");
  const [personaTag, setPersonaTag] = useState(initial?.personaTag ?? "");
  const [sourceChannel, setSourceChannel] = useState(
    initial?.sourceChannel ?? "b2b_outbound_cold",
  );
  const [meetingDate, setMeetingDate] = useState(
    initial?.meetingDate ?? todayLocal(),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName && !lastName && !email && !phone && !companyName) {
      setError("Provide at least one of name, email, phone, or company.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstName || null,
          lastName: lastName || null,
          email: email || null,
          phone: phone || null,
          title: title || null,
          companyName: companyName || null,
          stage,
          personaTag: personaTag || null,
          sourceChannel,
          meetingDate: meetingDate || null,
          companyId: initial?.companyId ?? null,
          notes: notes || null,
          cardImageUrl: initial?.cardImageUrl ?? null,
          cardRawText: initial?.cardRawText ?? null,
          ocrConfidence: confidence ?? null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? `Save failed (${res.status})`);
        setBusy(false);
        return;
      }
      if (onSuccess) onSuccess(body.data.id);
      else {
        router.push(`/leads/${body.data.id}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="firstName" confidence={confidence?.firstName}>
                First name
              </FieldLabel>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="lastName" confidence={confidence?.lastName}>
                Last name
              </FieldLabel>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="email" confidence={confidence?.email}>
                Email
              </FieldLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="phone" confidence={confidence?.phone}>
                Phone
              </FieldLabel>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="title" confidence={confidence?.title}>
                Title
              </FieldLabel>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="companyName"
                confidence={confidence?.companyName}
              >
                Company
              </FieldLabel>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="stage">Stage</FieldLabel>
              <select
                id="stage"
                className={SEL}
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {stageLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="personaTag">Persona (optional)</FieldLabel>
              <select
                id="personaTag"
                className={SEL}
                value={personaTag}
                onChange={(e) => setPersonaTag(e.target.value)}
              >
                <option value="">—</option>
                {LEAD_PERSONA_TAGS.map((p) => (
                  <option key={p} value={p}>
                    {personaLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="sourceChannel">Source</FieldLabel>
              <select
                id="sourceChannel"
                className={SEL}
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value)}
              >
                {LEAD_SOURCE_CHANNELS.map((s) => (
                  <option key={s} value={s}>
                    {sourceChannelLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="meetingDate">Meeting date</FieldLabel>
              <Input
                id="meetingDate"
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <textarea
              id="notes"
              className="min-h-[120px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {initial?.cardImageUrl && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer">Card photo</summary>
              {/* Using a plain <img> here to avoid next/image config burden in
                  the capture flow — these blobs live on Vercel Blob CDN. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={initial.cardImageUrl}
                alt="Business card"
                className="mt-2 rounded-md border border-zinc-200"
              />
            </details>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/leads")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
