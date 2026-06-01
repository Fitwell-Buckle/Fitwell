import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { getLead, listLeadCardImages } from "@/lib/crm/service";
import { listMessagesForLead, listOutboundMessages } from "@/lib/crm/messages";
import { PageHeader } from "@/components/ui/page-header";
import { leadDisplayName } from "@/lib/crm/display";
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

  const [companies, cardImages, messages, draftRows] = await Promise.all([
    db
      .select({ id: company.id, name: company.name })
      .from(company)
      .orderBy(asc(company.name)),
    listLeadCardImages(id),
    listMessagesForLead(id),
    listOutboundMessages({ status: "draft", leadId: id }),
  ]);

  const leadName = leadDisplayName(lead);
  const draftMessages = draftRows.map((m) => ({
    id: m.id,
    leadId: m.leadId,
    toEmail: m.toEmail,
    subject: m.subject,
    body: m.body,
    status: m.status,
    leadName,
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
          stage: lead.stage,
          personaTag: lead.personaTag,
          sourceChannel: lead.sourceChannel,
          meetingDate: lead.meetingDate,
          notes: lead.notes,
          cardImageUrl: lead.cardImageUrl,
          cardRawText: lead.cardRawText,
          companyId: lead.companyId,
          customerId: lead.customerId,
          status: lead.status,
        }}
        companies={companies}
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
        }))}
        draftMessages={draftMessages}
      />
    </div>
  );
}
