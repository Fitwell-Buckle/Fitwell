import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listOutboundMessages } from "@/lib/crm/messages";
import { leadDisplayName } from "@/lib/crm/display";
import { PageHeader } from "@/components/ui/page-header";
import { MessagesList } from "./messages-list";

export const metadata: Metadata = {
  title: "Messages to Send | Fitwell Admin",
};

export default async function MessagesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const rows = await listOutboundMessages();

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
      <PageHeader title="Messages to Send" />
      <p className="mt-2 text-sm text-zinc-500">
        AI-drafted follow-ups, queued after each lead is captured. Review,
        edit, then send from your email and mark them done.
      </p>
      <MessagesList messages={messages} />
    </div>
  );
}
