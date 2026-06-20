import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import {
  getLead,
  listAssignableOwners,
  listLeadCardImages,
  listLeadComments,
} from "@/lib/crm/service";
import { listMessagesForLead, listOutboundMessages } from "@/lib/crm/messages";
import { hasInboundFromAnyMailbox } from "@/lib/gmail/inbound";
import { PageHeader } from "@/components/ui/page-header";
import { leadDisplayName } from "@/lib/crm/display";
import { LinkedActivity } from "@/components/crm/linked-activity";
import { LeadDetail } from "./lead-detail";

export const metadata: Metadata = {
  title: "Lead | Fitwell Admin",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [companies, cardImages, messages, draftRows, comments, owners] =
    await Promise.all([
      db
        .select({ id: company.id, name: company.name })
        .from(company)
        .orderBy(asc(company.name)),
      listLeadCardImages(id),
      listMessagesForLead(id),
      listOutboundMessages({ statuses: ["draft", "scheduled"], leadId: id }),
      listLeadComments(id),
      listAssignableOwners(),
    ]);

  // Cheap (maxResults=1) check across every connected team inbox: any reply
  // newer than the last Replies-tab view → the tab gets a blue dot. Skipped
  // when there's no email.
  let hasNewReplies = false;
  if (lead.email) {
    const since = lead.repliesSeenAt ?? lead.createdAt ?? new Date(0);
    const { replied } = await hasInboundFromAnyMailbox(lead.email, since);
    hasNewReplies = replied;
  }

  const leadName = leadDisplayName(lead);
  const draftMessages = draftRows.map((m) => ({
    id: m.id,
    toEmail: m.toEmail,
    cc: m.cc,
    bcc: m.bcc,
    subject: m.subject,
    body: m.body,
    status: m.status,
    scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
    contactName: leadName,
    contactHref: `/leads/${m.leadId ?? lead.id}`,
  }));

  return (
    <div>
      <Link
        href="/leads"
        className="text-sm text-zinc-400 hover:text-zinc-700"
      >
        &larr; Leads
      </Link>
      <div className="mt-3">
        <PageHeader title={leadDisplayName(lead)} />
      </div>

      <LeadDetail
        lead={{
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          title: lead.title,
          companyName: lead.companyName,
          addressLine1: lead.addressLine1,
          addressLine2: lead.addressLine2,
          city: lead.city,
          region: lead.region,
          postalCode: lead.postalCode,
          country: lead.country,
          stage: lead.stage,
          personaTag: lead.personaTag,
          sourceChannel: lead.sourceChannel,
          meetingDate: lead.meetingDate,
          ownerUserId: lead.ownerUserId,
          notes: lead.notes,
          cardImageUrl: lead.cardImageUrl,
          cardRawText: lead.cardRawText,
          companyId: lead.companyId,
          customerId: lead.customerId,
          status: lead.status,
        }}
        companies={companies}
        owners={owners.map((o) => ({
          id: o.id,
          name: o.name || o.email || "Unknown",
        }))}
        cardImages={cardImages.map((c) => ({
          id: c.id,
          blobUrl: c.blobUrl,
          uploadedAt: c.uploadedAt,
        }))}
        messages={messages.map((m) => ({
          id: m.id,
          sequenceStep: m.sequenceStep,
          subject: m.subject,
          status: m.status,
          createdAt: m.createdAt,
          sentAt: m.sentAt,
          openCount: m.openCount,
          lastOpenedAt: m.lastOpenedAt,
        }))}
        comments={comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          author: c.authorName || c.authorEmail || null,
        }))}
        draftMessages={draftMessages}
        hasNewReplies={hasNewReplies}
      />
      <LinkedActivity context="lead" leadId={id} />
    </div>
  );
}
