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

  // Both the live queue (draft) and anything queued to auto-send (scheduled).
  const rows = await listOutboundMessages({ statuses: ["draft", "scheduled"] });
  const tabs = LEADS_TABS.map((t) =>
    t.href === "/messages" ? { ...t, dot: rows.length > 0 } : t,
  );

  const messages = rows.map((m) => {
    // Resolve the contact + a link to their detail page from whichever entity
    // the message targets (lead / customer / supplier).
    let contactName = m.toEmail ?? "Unknown";
    let contactHref: string | null = null;
    if (m.leadId) {
      contactName = leadDisplayName({
        firstName: m.leadFirstName,
        lastName: m.leadLastName,
        companyName: m.leadCompanyName,
        email: m.toEmail,
      });
      contactHref = `/leads/${m.leadId}`;
    } else if (m.customerId) {
      contactName = leadDisplayName({
        firstName: m.customerFirstName,
        lastName: m.customerLastName,
        email: m.toEmail,
      });
      contactHref = `/customers/${m.customerId}`;
    } else if (m.supplierId) {
      contactName = m.supplierName ?? m.toEmail ?? "Supplier";
      contactHref = `/modules/production/suppliers/${m.supplierId}`;
    }
    return {
      id: m.id,
      toEmail: m.toEmail,
      cc: m.cc,
      bcc: m.bcc,
      subject: m.subject,
      body: m.body,
      status: m.status,
      scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
      contactName,
      contactHref,
    };
  });

  return (
    <div>
      <PageHeader title="Leads" />
      <SectionTabs tabs={tabs} />
      <p className="mt-4 text-sm text-zinc-500">
        Follow-ups to review — auto-drafted after a lead is captured, and when an
        email you sent (to a lead, customer, or supplier) goes unanswered. Edit,
        then send from your Gmail.
      </p>
      <MessagesList messages={messages} />
    </div>
  );
}
