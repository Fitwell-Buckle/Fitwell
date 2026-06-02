import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { countDraftMessages, listOutboundMessages } from "@/lib/crm/messages";
import { leadDisplayName } from "@/lib/crm/display";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { LEADS_TABS } from "@/lib/nav-tabs";
import { MessagesList } from "./messages-list";

export const metadata: Metadata = {
  title: "Next Steps | Fitwell Admin",
};

export default async function MessagesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const rows = await listOutboundMessages();
  const tabs = LEADS_TABS.map((t) =>
    t.href === "/messages" ? { ...t, dot: rows.length > 0 } : t,
  );

  const messages = rows.map((m) => ({
    id: m.id,
    leadId: m.leadId,
    toEmail: m.toEmail,
    subject: m.subject,
    body: m.body,
    status: m.status,
    leadName: leadDisplayName({
      firstName: m.leadFirstName,
      lastName: m.leadLastName,
      companyName: m.leadCompanyName,
      email: m.toEmail,
    }),
  }));

  return (
    <div>
      <PageHeader title="Leads" />
      <SectionTabs tabs={tabs} />
      <p className="mt-4 text-sm text-zinc-500">
        AI-drafted follow-ups, queued after each lead is captured. Review,
        edit, then send from your email and mark them done.
      </p>
      <MessagesList messages={messages} />
    </div>
  );
}
