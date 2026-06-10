"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GmailEmailInput } from "@/components/crm/gmail-email-input";
import { useDictation } from "@/components/ui/use-dictation";
import {
  CompanyPicker,
  type CompanyOption,
} from "@/components/crm/company-picker";
import {
  LEAD_PERSONA_TAGS,
  LEAD_SOURCE_CHANNELS,
  LEAD_STAGES,
} from "@/lib/crm/constants";
import {
  personaLabel,
  sourceChannelLabel,
  splitFullName,
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
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
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
  // Optional second save button. Saves the lead exactly like the primary
  // submit but runs this callback afterwards instead of `onSuccess` (e.g. the
  // capture flow uses it for a plain "Save" that goes to the leads list while
  // the primary loops back to the camera). Hidden when not provided.
  secondaryLabel?: string;
  onSecondary?: (newLeadId: string) => void;
  // Booth-capture mode: collapse the stage/persona/source/date fields (their
  // defaults are already right) so the screen is just identity + notes + save.
  rapid?: boolean;
  // Our companies, for the searchable company picker. Empty = picker still works
  // as free text + "add new".
  companies?: CompanyOption[];
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
  secondaryLabel,
  onSecondary,
  rapid = false,
  companies = [],
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
  const [companyId, setCompanyId] = useState<string | null>(
    initial?.companyId ?? null,
  );
  const [addressLine1, setAddressLine1] = useState(
    initial?.addressLine1 ?? "",
  );
  const [addressLine2, setAddressLine2] = useState(
    initial?.addressLine2 ?? "",
  );
  const [city, setCity] = useState(initial?.city ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [stage, setStage] = useState(initial?.stage ?? "lead");
  const [personaTag, setPersonaTag] = useState(initial?.personaTag ?? "");
  const [sourceChannel, setSourceChannel] = useState(
    initial?.sourceChannel ?? "b2b_outbound_cold",
  );
  const [meetingDate, setMeetingDate] = useState(
    initial?.meetingDate ?? todayLocal(),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const dictation = useDictation(setNotes, () => notes);
  // Set when the server reports a same-email duplicate (409); offers the user
  // "open existing" vs "create anyway".
  const [dupLeadId, setDupLeadId] = useState<string | null>(null);
  // Which post-save behavior the in-flight save should run. Remembered so the
  // 409 "Create anyway" retry (which carries no callback) reuses whichever
  // button started it.
  const onDoneRef = useRef<((id: string) => void) | undefined>(undefined);

  async function save(allowDuplicate: boolean, onDone?: (id: string) => void) {
    setError(null);
    if (!firstName && !lastName && !email && !phone && !companyName) {
      setError("Provide at least one of name, email, phone, or company.");
      return;
    }
    // Record the completion behavior for this save. A fresh primary submit
    // (no callback, not a dup-retry) clears any prior secondary intent so it
    // falls back to onSuccess; "Create anyway" (allowDuplicate, no callback)
    // keeps whatever the originating button set.
    if (onDone !== undefined) onDoneRef.current = onDone;
    else if (!allowDuplicate) onDoneRef.current = undefined;
    setBusy(true);
    setDupLeadId(null);
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
          addressLine1: addressLine1 || null,
          addressLine2: addressLine2 || null,
          city: city || null,
          region: region || null,
          postalCode: postalCode || null,
          country: country || null,
          stage,
          personaTag: personaTag || null,
          sourceChannel,
          meetingDate: meetingDate || null,
          companyId,
          notes: notes || null,
          cardImageUrl: initial?.cardImageUrl ?? null,
          cardRawText: initial?.cardRawText ?? null,
          ocrConfidence: confidence ?? null,
          allowDuplicate,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.existingLeadId) {
        setDupLeadId(body.existingLeadId as string);
        setBusy(false);
        return;
      }
      if (!res.ok) {
        setError(body?.error ?? `Save failed (${res.status})`);
        setBusy(false);
        return;
      }
      const newId = body.data.id as string;
      // Fire-and-forget: queue an AI-drafted initial follow-up in Next Steps.
      // `auto=1` so it respects the Settings "initial draft" toggle (the manual
      // button omits it). Don't block navigation; failures are non-fatal.
      void fetch(`/api/leads/${newId}/draft-followup?auto=1`, {
        method: "POST",
      }).catch(() => {});
      const finish = onDoneRef.current ?? onSuccess;
      if (finish) finish(newId);
      else {
        router.push(`/leads/${newId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void save(false);
  }

  // Persona — pulled to the very top of the form (the first thing you set
  // when capturing a lead at a booth).
  const personaField = (
    <div>
      <FieldLabel htmlFor="personaTag">Persona</FieldLabel>
      <select
        id="personaTag"
        className={SEL}
        value={personaTag}
        onChange={(e) => setPersonaTag(e.target.value)}
      >
        <option value="">— pick a persona —</option>
        {LEAD_PERSONA_TAGS.map((p) => (
          <option key={p} value={p}>
            {personaLabel(p)}
          </option>
        ))}
      </select>
    </div>
  );

  // Quick note — directly under persona.
  const notesField = (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <FieldLabel htmlFor="notes">Quick note</FieldLabel>
        {dictation.supported && (
          <button
            type="button"
            onClick={dictation.toggle}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
              dictation.listening
                ? "bg-red-100 text-red-700"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
            aria-pressed={dictation.listening}
          >
            <Mic className="h-3.5 w-3.5" />
            {dictation.listening ? "Listening… tap to stop" : "Dictate"}
          </button>
        )}
      </div>
      <textarea
        id="notes"
        className="min-h-[120px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Quick note — or tap Dictate and speak"
      />
    </div>
  );

  // Mailing address. Free-text everything (incl. country) so foreign /
  // international formats fit without a fixed picker.
  const addressFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FieldLabel htmlFor="addressLine1">Street address</FieldLabel>
        <Input
          id="addressLine1"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          placeholder="Street name and number"
        />
      </div>
      <div className="sm:col-span-2">
        <FieldLabel htmlFor="addressLine2">
          Address line 2 (optional)
        </FieldLabel>
        <Input
          id="addressLine2"
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          placeholder="Suite, unit, floor, building"
        />
      </div>
      <div>
        <FieldLabel htmlFor="city">City</FieldLabel>
        <Input
          id="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="region">State / Province / Region</FieldLabel>
        <Input
          id="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="postalCode">ZIP / Postal code</FieldLabel>
        <Input
          id="postalCode"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="country">Country</FieldLabel>
        <Input
          id="country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="e.g. United States"
        />
      </div>
    </div>
  );

  const advancedFields = (
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
  );

  return (
    <Card>
      <CardContent>
        {dupLeadId && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-900">
              A lead with this email already exists.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/leads/${dupLeadId}`}>Open existing lead</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Create anyway
              </Button>
            </div>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          {/* Persona first, then the quick note — the two things you set by
              hand at a booth before anything else. */}
          {personaField}

          {notesField}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Email leads the contact fields: picking a Gmail match fills the
                name (and saves typing), so it goes first. */}
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="email" confidence={confidence?.email}>
                Email
              </FieldLabel>
              <GmailEmailInput
                id="email"
                value={email}
                onChange={setEmail}
                onPickContact={(m) => {
                  // Fill name from the Gmail contact, but only blanks — never
                  // clobber a name the user already typed.
                  const { firstName: fn, lastName: ln } = splitFullName(m.name);
                  if (fn && !firstName.trim()) setFirstName(fn);
                  if (ln && !lastName.trim()) setLastName(ln);
                }}
              />
            </div>
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
                Company (optional)
              </FieldLabel>
              <CompanyPicker
                companies={companies}
                companyId={companyId}
                companyName={companyName}
                contact={{
                  name: [firstName, lastName].filter(Boolean).join(" ") || null,
                  email: email || null,
                }}
                onChange={(v) => {
                  setCompanyId(v.companyId);
                  setCompanyName(v.companyName);
                }}
              />
            </div>
          </div>

          {/* Address: inline in full mode; one tap away in rapid booth mode. */}
          {rapid ? (
            <details className="rounded-md border border-zinc-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-600">
                Address (optional)
              </summary>
              <div className="mt-3">{addressFields}</div>
            </details>
          ) : (
            addressFields
          )}

          {/* Stage / source / meeting date: collapsed in rapid mode — the
              defaults are already right for booth capture. */}
          {rapid ? (
            <details className="rounded-md border border-zinc-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-600">
                More details (stage, source, date)
              </summary>
              <div className="mt-3">{advancedFields}</div>
            </details>
          ) : (
            advancedFields
          )}

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

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/leads")}
            >
              Cancel
            </Button>
            {onSecondary && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void save(false, onSecondary)}
              >
                {secondaryLabel ?? "Save"}
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
