"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { Input } from "@/components/ui/input";
import { MessagesList, type MessageView } from "@/app/(admin)/messages/messages-list";
import { RepliesTab } from "./replies-tab";
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

export interface LeadMessageView {
  id: string;
  sequenceStep: number;
  subject: string | null;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
}

export function LeadDetail({
  lead,
  companies,
  cardImages,
  messages,
  draftMessages,
  hasNewReplies,
}: {
  lead: LeadView;
  companies: { id: string; name: string }[];
  cardImages: LeadCardImageView[];
  messages: LeadMessageView[];
  draftMessages: MessageView[];
  hasNewReplies: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeadView>(lead);
  // Overview is read-only until the user clicks Edit.
  const [editing, setEditing] = useState(false);
  // Which section was just saved — drives the inline "✓ Saved" button state.
  // Cleared as soon as the user edits anything again.
  const [savedKey, setSavedKey] = useState<null | "overview" | "notes">(null);
  const [convertCompanyId, setConvertCompanyId] = useState(
    lead.companyId ?? "",
  );

  function set<K extends keyof LeadView>(key: K, value: LeadView[K]) {
    setSavedKey(null);
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Returns null on success, or the error message on failure (so callers can
  // toast the actual message — reading the `error` state here would be stale).
  async function patch(body: Record<string, unknown>): Promise<string | null> {
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
        const msg = json?.error ?? `Save failed (${res.status})`;
        setError(msg);
        return msg;
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      return msg;
    } finally {
      setBusy(false);
    }
  }

  async function saveOverview() {
    const err = await patch({
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
    if (!err) {
      // Confirmation is the inline green "✓ Saved" button — no toast, to
      // avoid a duplicate notification for the same action.
      setSavedKey("overview");
      setEditing(false);
      router.refresh();
    } else {
      toast.error(err);
    }
  }

  function cancelEdit() {
    setDraft(lead);
    setEditing(false);
    setError(null);
  }

  async function saveNotes() {
    const err = await patch({ notes: draft.notes });
    if (!err) {
      setSavedKey("notes");
      router.refresh();
    } else {
      toast.error(err);
    }
  }

  // Save the current notes, then ask Claude to draft a follow-up from them and
  // queue it in Messages to Send. Lets the user generate a draft after adding
  // notes they forgot at capture time.
  async function draftFollowupFromNotes() {
    const err = await patch({ notes: draft.notes });
    if (err) {
      toast.error(err);
      return;
    }
    setSavedKey("notes");
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/draft-followup`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? "Couldn't draft the email");
        return;
      }
      toast.success("Draft follow-up added to Messages to Send");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft the email");
    } finally {
      setBusy(false);
    }
  }

  async function convertToCompany() {
    if (!convertCompanyId) {
      setError("Pick a company to convert into.");
      toast.error("Pick a company to convert into.");
      return;
    }
    const err = await patch({
      companyId: convertCompanyId,
      status: "converted",
    });
    if (!err) {
      toast.success("Lead converted to company");
      router.refresh();
    } else {
      toast.error(err);
    }
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
        const msg = json?.error ?? `Drop failed (${res.status})`;
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Lead dropped");
      router.push("/leads");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteLead() {
    if (
      !confirm(
        "Permanently delete this lead, including its card images and drafted messages? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}?hard=1`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json?.error ?? `Delete failed (${res.status})`;
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Lead deleted");
      router.push("/leads");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const readonlyRow = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-zinc-900">{value || "—"}</dd>
    </div>
  );

  const overviewReadonly = (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between">
          <dl className="grid flex-1 gap-4 sm:grid-cols-2">
            {readonlyRow(
              "Name",
              [draft.firstName, draft.lastName].filter(Boolean).join(" "),
            )}
            {readonlyRow("Email", draft.email)}
            {readonlyRow("Phone", draft.phone)}
            {readonlyRow("Title", draft.title)}
            {readonlyRow("Company", draft.companyName)}
            {readonlyRow("Stage", stageLabel(draft.stage))}
            {readonlyRow(
              "Persona",
              draft.personaTag ? personaLabel(draft.personaTag) : null,
            )}
            {readonlyRow("Source", sourceChannelLabel(draft.sourceChannel))}
            {readonlyRow("Meeting date", draft.meetingDate)}
          </dl>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSavedKey(null);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        </div>

        {cardImages.length > 0 && (
          <div className="mt-6">
            <p className={LBL}>Business-card photos ({cardImages.length})</p>
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
      </CardContent>
    </Card>
  );

  const overviewEdit = (
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

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={cancelEdit} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={saveOverview} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const overview = editing ? overviewEdit : overviewReadonly;

  const history = (
    <Card>
      <CardContent>
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            No follow-up emails yet. Drafts appear here (and in Messages to
            Send) once created.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {messages.map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-3">
                <Badge className={statusBadgeClass(m.status)}>
                  {m.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {m.sequenceStep >= 2
                      ? "Two-week follow-up nudge"
                      : "Initial follow-up"}
                    {m.subject ? ` — ${m.subject}` : ""}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Drafted{" "}
                    {m.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {m.sentAt
                      ? ` · sent ${m.sentAt.toLocaleDateString("en-US")}`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
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
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {savedKey === "notes" && !busy && (
            <span className="text-sm font-medium text-emerald-600">
              ✓ Saved
            </span>
          )}
          <Button variant="outline" onClick={draftFollowupFromNotes} disabled={busy}>
            Draft follow-up email
          </Button>
          <Button
            onClick={saveNotes}
            disabled={busy}
            className={
              savedKey === "notes" && !busy
                ? "bg-emerald-600 hover:bg-emerald-700"
                : undefined
            }
          >
            {busy ? "Saving…" : savedKey === "notes" ? "✓ Saved" : "Save notes"}
          </Button>
        </div>
        <p className="mt-2 text-right text-xs text-zinc-500">
          Drafts an AI follow-up from these notes into Customers → Leads →
          Messages to Send.
        </p>
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
              variant="outline"
              onClick={dropLead}
              disabled={busy || draft.status === "dropped"}
            >
              Drop lead
            </Button>
            <Button
              variant="destructive"
              onClick={deleteLead}
              disabled={busy}
            >
              Delete
            </Button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Converting links this lead to the chosen company and marks it{" "}
            <strong>converted</strong>. A Shopify customer record is only
            created when the company places a real order.
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
          {
            value: "messages",
            label: "Messages to Send",
            dot: draftMessages.length > 0,
            content:
              draftMessages.length > 0 ? (
                <div className="mt-2">
                  <MessagesList messages={draftMessages} />
                </div>
              ) : (
                <Card>
                  <CardContent>
                    <p className="py-6 text-center text-sm text-zinc-400">
                      Nothing to send. Draft a follow-up from the Notes tab.
                    </p>
                  </CardContent>
                </Card>
              ),
          },
          {
            value: "replies",
            label: "Replies",
            dot: hasNewReplies,
            content: <RepliesTab leadId={lead.id} />,
          },
          { value: "history", label: "History", content: history },
        ]}
      />
    </div>
  );
}
