import { eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  lead,
  leadComment,
  supplierLead,
  tradeShowVendor,
  tradeShowVendorVoiceNote,
  user,
} from "@/lib/schema";
import { leadDisplayName } from "@/lib/crm/display";
import { listVendorComments } from "./service";

// A booth-met entity can be three linked records at once: the `trade_show_vendor`
// (the hub), a customer `lead`, and a `supplier_lead`. This module resolves the
// linked set from ANY of their ids and builds one merged, newest-first activity
// timeline so every detail page can show the full picture. Email/WhatsApp
// messages are merged client-side (from the lead's existing /replies endpoint)
// to keep this server pass fast.

export interface LinkRefs {
  vendorId?: string;
  leadId?: string;
  supplierLeadId?: string;
}

export type ActivityItem =
  | { kind: "note"; id: string; at: string; author: string | null; body: string }
  | {
      kind: "voice";
      id: string;
      at: string;
      author: string | null;
      transcript: string | null;
      blobUrl: string;
      durationSec: number | null;
    }
  | {
      kind: "lead_comment";
      id: string;
      at: string;
      author: string | null;
      body: string;
    }
  | { kind: "event"; id: string; at: string; label: string };

export interface LinkedActivity {
  links: {
    vendorId: string;
    showId: string;
    vendorCompanyName: string;
    leadId: string | null;
    leadName: string | null;
    supplierLeadId: string | null;
    supplierLeadName: string | null;
  };
  notes: {
    booth: string | null;
    customerLead: string | null;
    supplierLead: string | null;
  };
  timeline: ActivityItem[];
}

function supplierLeadName(l: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
}): string {
  return (
    [l.firstName, l.lastName].filter(Boolean).join(" ").trim() ||
    l.companyName ||
    l.email ||
    "Supplier lead"
  );
}

// Find the vendor hub from whichever id the caller has.
export async function resolveLinkedVendor(refs: LinkRefs) {
  let where: SQL | undefined;
  if (refs.vendorId) where = eq(tradeShowVendor.id, refs.vendorId);
  else if (refs.leadId) where = eq(tradeShowVendor.leadId, refs.leadId);
  else if (refs.supplierLeadId)
    where = eq(tradeShowVendor.supplierLeadId, refs.supplierLeadId);
  if (!where) return null;
  return db.query.tradeShowVendor.findFirst({
    where,
    with: { tradeShow: true },
  });
}

export async function getEntityActivity(
  refs: LinkRefs,
): Promise<LinkedActivity | null> {
  const vendor = await resolveLinkedVendor(refs);
  if (!vendor) return null;

  const [customerLead, supplier] = await Promise.all([
    vendor.leadId
      ? db.query.lead.findFirst({ where: eq(lead.id, vendor.leadId) })
      : Promise.resolve(undefined),
    vendor.supplierLeadId
      ? db.query.supplierLead.findFirst({
          where: eq(supplierLead.id, vendor.supplierLeadId),
        })
      : Promise.resolve(undefined),
  ]);

  // ── Timeline sources (DB) ──
  const items: ActivityItem[] = [];

  // Shared thread comments.
  const comments = await listVendorComments(vendor.id);
  for (const c of comments) {
    items.push({
      kind: "note",
      id: c.id,
      at: c.createdAt.toISOString(),
      author: c.authorName || c.authorEmail || null,
      body: c.body,
    });
  }

  // Booth voice notes (with transcript).
  const voiceNotes = await db
    .select({
      id: tradeShowVendorVoiceNote.id,
      createdAt: tradeShowVendorVoiceNote.createdAt,
      transcript: tradeShowVendorVoiceNote.transcript,
      blobUrl: tradeShowVendorVoiceNote.blobUrl,
      durationSec: tradeShowVendorVoiceNote.durationSec,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(tradeShowVendorVoiceNote)
    .leftJoin(user, eq(tradeShowVendorVoiceNote.recordedByUserId, user.id))
    .where(eq(tradeShowVendorVoiceNote.vendorId, vendor.id));
  for (const v of voiceNotes) {
    items.push({
      kind: "voice",
      id: v.id,
      at: v.createdAt.toISOString(),
      author: v.authorName || v.authorEmail || null,
      transcript: v.transcript,
      blobUrl: v.blobUrl,
      durationSec: v.durationSec,
    });
  }

  // The customer lead's own timeline comments (read-only here).
  if (customerLead) {
    const leadComments = await db
      .select({
        id: leadComment.id,
        body: leadComment.body,
        createdAt: leadComment.createdAt,
        authorName: user.name,
        authorEmail: user.email,
      })
      .from(leadComment)
      .leftJoin(user, eq(leadComment.authorUserId, user.id))
      .where(eq(leadComment.leadId, customerLead.id));
    for (const c of leadComments) {
      items.push({
        kind: "lead_comment",
        id: c.id,
        at: c.createdAt.toISOString(),
        author: c.authorName || c.authorEmail || null,
        body: c.body,
      });
    }
  }

  // ── Events ──
  const showName = vendor.tradeShow?.name ?? "the show";
  const pushEvent = (id: string, at: Date | null, label: string) => {
    if (at) items.push({ kind: "event", id, at: at.toISOString(), label });
  };
  pushEvent(`ev-added-${vendor.id}`, vendor.createdAt, `Added at ${showName}`);
  pushEvent(`ev-visited-${vendor.id}`, vendor.visitedAt, "Visited the booth");
  pushEvent(`ev-sample-${vendor.id}`, vendor.sampleGivenAt, "Gave a sample");
  if (customerLead)
    pushEvent(
      `ev-conv-cust-${vendor.id}`,
      customerLead.capturedAt,
      "Converted to a Customer Lead",
    );
  if (supplier)
    pushEvent(
      `ev-conv-supp-${vendor.id}`,
      supplier.capturedAt,
      "Converted to a Supplier Lead",
    );

  // Newest first.
  items.sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));

  return {
    links: {
      vendorId: vendor.id,
      showId: vendor.tradeShowId,
      vendorCompanyName: vendor.companyName,
      leadId: vendor.leadId,
      leadName: customerLead ? leadDisplayName(customerLead) : null,
      supplierLeadId: vendor.supplierLeadId,
      supplierLeadName: supplier ? supplierLeadName(supplier) : null,
    },
    notes: {
      booth: vendor.notes,
      customerLead: customerLead?.notes ?? null,
      supplierLead: supplier?.notes ?? null,
    },
    timeline: items,
  };
}
