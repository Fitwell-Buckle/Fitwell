"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDictation } from "@/components/ui/use-dictation";
import { SupplierTypeSelect } from "./supplier-type-select";

const LIST_HREF = "/modules/production/supplier-leads";

export interface SupplierLeadFormInitial {
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
  supplierTypes?: string[] | null;
  notes?: string | null;
  cardImageUrl?: string | null;
  cardRawText?: string | null;
}

export interface SupplierLeadFormProps {
  initial?: SupplierLeadFormInitial;
  // OCR confidence per field, only set in photo-capture mode. Drives a small
  // colored indicator beside each input so the eye jumps to low-confidence
  // fields first.
  confidence?: Record<string, number | undefined>;
  // When set, the form edits this existing supplier lead (PATCH) instead of
  // creating a new one (POST).
  leadId?: string;
  submitLabel?: string;
  onSuccess?: (id: string) => void;
  // Optional second save button — saves like the primary but runs this
  // afterwards (capture flow uses it for a plain "Save" → list). Hidden when
  // not provided.
  secondaryLabel?: string;
  onSecondary?: (id: string) => void;
  // Booth-capture mode: collapse the address block so the screen is just
  // identity + note + save.
  rapid?: boolean;
}

const LBL = "block text-xs font-medium text-zinc-500";

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

export function SupplierLeadForm({
  initial,
  confidence,
  leadId,
  submitLabel = "Save supplier lead",
  onSuccess,
  secondaryLabel,
  onSecondary,
  rapid = false,
}: SupplierLeadFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [addressLine1, setAddressLine1] = useState(initial?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(initial?.addressLine2 ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [supplierTypes, setSupplierTypes] = useState<string[]>(
    initial?.supplierTypes ?? [],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const dictation = useDictation(setNotes, () => notes);

  async function save(onDone?: (id: string) => void) {
    setError(null);
    if (!firstName && !lastName && !email && !phone && !companyName) {
      setError("Provide at least one of name, email, phone, or company.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: firstName || null,
        lastName: lastName || null,
        email: email || null,
        phone: phone || null,
        title: title || null,
        companyName: companyName || null,
        website: website || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        region: region || null,
        postalCode: postalCode || null,
        country: country || null,
        supplierTypes,
        notes: notes || null,
      };
      if (!leadId) {
        payload.cardImageUrl = initial?.cardImageUrl ?? null;
        payload.cardRawText = initial?.cardRawText ?? null;
        payload.ocrConfidence = confidence ?? null;
      }
      const res = await fetch(
        leadId ? `/api/supplier-leads/${leadId}` : "/api/supplier-leads",
        {
          method: leadId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? `Save failed (${res.status})`);
        setBusy(false);
        return;
      }
      const id = (body.data?.id as string) ?? leadId ?? "";
      const finish = onDone ?? onSuccess;
      if (finish) finish(id);
      else {
        router.push(`${LIST_HREF}/${id}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void save();
  }

  // Supplier persona(s) — the first thing you set when capturing a supplier
  // card. Multi-select; "Other" lets you add a free-text persona that sticks.
  const supplierTypeField = (
    <div>
      <FieldLabel htmlFor="supplierTypes">Supplier persona</FieldLabel>
      <SupplierTypeSelect value={supplierTypes} onChange={setSupplierTypes} />
    </div>
  );

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
        <FieldLabel htmlFor="addressLine2">Address line 2 (optional)</FieldLabel>
        <Input
          id="addressLine2"
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          placeholder="Suite, unit, floor, building"
        />
      </div>
      <div>
        <FieldLabel htmlFor="city">City</FieldLabel>
        <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
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

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {supplierTypeField}

          {notesField}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
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
                Company / supplier name
              </FieldLabel>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="website" confidence={confidence?.website}>
                Website
              </FieldLabel>
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
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

          {initial?.cardImageUrl && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer">Card photo</summary>
              {/* Plain <img>: these blobs live on Vercel Blob CDN. */}
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
              onClick={() => router.push(LIST_HREF)}
            >
              Cancel
            </Button>
            {onSecondary && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void save(onSecondary)}
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
