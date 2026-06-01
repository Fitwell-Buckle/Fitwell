"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { Input } from "@/components/ui/input";
import {
  LEAD_PERSONA_TAGS,
  LEAD_SOURCE_CHANNELS,
  LEAD_STAGES,
} from "@/lib/crm/constants";
import {
  personaLabel,
  sourceChannelLabel,
  stageBadgeClass,
  stageLabel,
  statusBadgeClass,
} from "@/lib/crm/display";

const LBL = "mb-1 block text-xs font-medium text-zinc-500";
const SEL =
  "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950";

export interface LeadView {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyName: string | null;
  stage: string;
  personaTag: string | null;
  sourceChannel: string;
  meetingDate: string | null;
  notes: string | null;
  cardImageUrl: string | null;
  cardRawText: string | null;
  companyId: string | null;
  customerId: string | null;
  status: string;
}

export interface LeadCardImageView {
  id: string;
  blobUrl: string;
  uploadedAt: Date;
}

export function LeadDetail({
  lead,
  companies,
  cardImages,
}: {
  lead: LeadView;
  companies: { id: string; name: string }[];
  cardImages: LeadCardImageView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeadView>(lead);
  const [convertCompanyId, setConvertCompanyId] = useState(
    lead.companyId ?? "",
  );

  function set<K extends keyof LeadView>(key: K, value: LeadView[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? `Save failed (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveOverview() {
    const ok = await patch({
      firstName: draft.firstName,
      lastName: draft.lastName,
      email: draft.email,
      phone: draft.phone,
      title: draft.title,
      companyName: draft.companyName,
      stage: draft.stage,
      personaTag: draft.personaTag || null,
      sourceChannel: draft.sourceChannel,
      meetingDate: draft.meetingDate || null,
    });
    if (ok) router.refresh();
  }

  async function saveNotes() {
    const ok = await patch({ notes: draft.notes });
    if (ok) router.refresh();
  }

  async function convertToCompany() {
    if (!convertCompanyId) {
      setError("Pick a company to convert into.");
      return;
    }
    const ok = await patch({
      companyId: convertCompanyId,
      status: "converted",
    });
    if (ok) router.refresh();
  }

  async function dropLead() {
    if (!confirm("Drop this lead? It will be archived (status = dropped).")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error ?? `Drop failed (${res.status})`);
        return;
      }
      router.push("/leads");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const overview = (
    <Card>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LBL}>First name</label>
            <Input
              value={draft.firstName ?? ""}
              onChange={(e) => set("firstName", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LBL}>Last name</label>
            <Input
              value={draft.lastName ?? ""}
              onChange={(e) => set("lastName", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LBL}>Email</label>
            <Input
              type="email"
              value={draft.email ?? ""}
              onChange={(e) => set("email", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LBL}>Phone</label>
            <Input
              value={draft.phone ?? ""}
              onChange={(e) => set("phone", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LBL}>Title</label>
            <Input
              value={draft.title ?? ""}
              onChange={(e) => set("title", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LBL}>Company (free-text)</label>
            <Input
              value={draft.companyName ?? ""}
              onChange={(e) => set("companyName", e.target.value || null)}
            />
          </div>
          <div>
            <label className={LBL}>Stage</label>
            <select
              className={SEL}
              value={draft.stage}
              onChange={(e) => set("stage", e.target.value)}
            >
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LBL}>Persona</label>
            <select
              className={SEL}
              value={draft.personaTag ?? ""}
              onChange={(e) => set("personaTag", e.target.value || null)}
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
            <label className={LBL}>Source</label>
            <select
              className={SEL}
              value={draft.sourceChannel}
              onChange={(e) => set("sourceChannel", e.target.value)}
            >
              {LEAD_SOURCE_CHANNELS.map((s) => (
                <option key={s} value={s}>
                  {sourceChannelLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LBL}>Meeting date</label>
            <Input
              type="date"
              value={draft.meetingDate ?? ""}
              onChange={(e) => set("meetingDate", e.target.value || null)}
            />
          </div>
        </div>

        {cardImages.length > 0 && (
          <div className="mt-6">
            <p className={LBL}>
              Business-card photos ({cardImages.length})
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cardImages.map((c) => (
                <a
                  key={c.id}
                  href={c.blobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group block"
                >
                  <Image
                    src={c.blobUrl}
                    alt="Business card"
                    width={320}
                    height={200}
                    unoptimized
                    className="aspect-[5/3] w-full rounded-md border border-zinc-200 object-cover transition-opacity group-hover:opacity-90"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {c.uploadedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={saveOverview} disabled={busy}>
            {busy ? "Saving…" : "Save overview"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const notes = (
    <Card>
      <CardContent>
        <textarea
          className="min-h-[200px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
          value={draft.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
        />
        {lead.cardRawText && (
          <div className="mt-4">
            <p className={LBL}>Card text (raw OCR)</p>
            <pre className="whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600">
              {lead.cardRawText}
            </pre>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={saveNotes} disabled={busy}>
            {busy ? "Saving…" : "Save notes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge className={stageBadgeClass(draft.stage)}>
          {stageLabel(draft.stage)}
        </Badge>
        <Badge className={statusBadgeClass(draft.status)}>{draft.status}</Badge>
        {draft.personaTag && <Badge>{draft.personaTag}</Badge>}
      </div>

      <Card className="mt-5">
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className={LBL}>Convert to company</label>
              <select
                className={SEL}
                value={convertCompanyId}
                onChange={(e) => setConvertCompanyId(e.target.value)}
              >
                <option value="">— pick a company —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={convertToCompany}
              disabled={busy || !convertCompanyId}
            >
              Convert
            </Button>
            <Button
              variant="destructive"
              onClick={dropLead}
              disabled={busy || draft.status === "dropped"}
            >
              Drop lead
            </Button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Conversion writes the company FK and marks the lead{" "}
            <code>converted</code>. A Shopify customer record is only created
            when the company places a real order.
          </p>
        </CardContent>
      </Card>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <DetailTabs
        tabs={[
          { value: "overview", label: "Overview", content: overview },
          { value: "notes", label: "Notes", content: notes },
        ]}
      />
    </div>
  );
}
