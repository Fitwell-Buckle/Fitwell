import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminNotification,
  company,
  companyContact,
  customer,
  customerMessage,
  user as userTable,
} from "@/lib/schema";
import {
  listConnectedMailboxes,
  listRecentInbound,
} from "@/lib/gmail/inbound";
import {
  matchCustomerSender,
  type CustomerEmailIndex,
} from "./customer-match";
import { buildInternalEmailMatcher } from "./internal-email";

// Build the email→customer / email→company index from stored records.
export async function buildCustomerEmailIndex(): Promise<CustomerEmailIndex> {
  const [companyRows, contactRows, customerRows] = await Promise.all([
    db.select({ id: company.id, email: company.contactEmail }).from(company),
    db
      .select({ companyId: companyContact.companyId, email: companyContact.email })
      .from(companyContact),
    db.select({ id: customer.id, email: customer.email }).from(customer),
  ]);

  const companyByEmail = new Map<string, string>();
  for (const r of companyRows) {
    if (r.email) companyByEmail.set(r.email.toLowerCase(), r.id);
  }
  for (const r of contactRows) {
    if (r.email) companyByEmail.set(r.email.toLowerCase(), r.companyId);
  }
  const customerByEmail = new Map<string, string>();
  for (const r of customerRows) {
    if (r.email) customerByEmail.set(r.email.toLowerCase(), r.id);
  }
  return { companyByEmail, customerByEmail };
}

// Scan each connected team inbox for recent inbound mail, match senders to
// known customers/companies, and record new ones (dedup on gmail message id),
// raising an in-app notification per new match. Idempotent: re-running only
// inserts messages it hasn't seen. No-ops when Gmail isn't connected/enabled.
export async function scanCustomerMessages(): Promise<{
  scanned: number;
  inserted: number;
}> {
  const index = await buildCustomerEmailIndex();
  if (index.companyByEmail.size === 0 && index.customerByEmail.size === 0) {
    return { scanned: 0, inserted: 0 };
  }
  const mailboxes = await listConnectedMailboxes();
  // Never record our own mail as a "customer message" — guards against an
  // internal/Fitwell address being stored as a customer/company contact.
  const isInternal = buildInternalEmailMatcher([
    ...mailboxes.map((m) => m.email),
    ...(process.env.ADMIN_EMAILS ?? "").split(","),
  ]);
  let scanned = 0;
  let inserted = 0;

  for (const mb of mailboxes) {
    const msgs = await listRecentInbound(mb.userId, 25);
    for (const m of msgs) {
      scanned++;
      const match = matchCustomerSender(m.from, index);
      if (!match || isInternal(match.email)) continue;

      const rows = await db
        .insert(customerMessage)
        .values({
          gmailMessageId: m.id,
          threadId: m.threadId,
          mailboxUserId: mb.userId,
          mailboxLabel: mb.label,
          fromEmail: match.email,
          fromName: match.name,
          subject: m.subject || null,
          snippet: m.snippet || null,
          receivedAt: m.dateMs ? new Date(m.dateMs) : null,
          audience: match.audience,
          customerId: match.customerId,
          companyId: match.companyId,
        })
        .onConflictDoNothing({ target: customerMessage.gmailMessageId })
        .returning({ id: customerMessage.id });

      if (rows.length === 0) continue; // already recorded
      inserted++;

      const who = match.name || match.email;
      await db.insert(adminNotification).values({
        type: "customer_message",
        title: `New message from ${who}`,
        body: m.subject || m.snippet || null,
        href: match.audience === "b2b" ? "/customers/brands" : "/customers",
      });
    }
  }
  return { scanned, inserted };
}

export interface CustomerMessageView {
  id: string;
  gmailMessageId: string;
  threadId: string | null;
  fromEmail: string;
  displayName: string;
  subject: string | null;
  snippet: string | null;
  receivedAt: Date | null;
  audience: string;
  mailboxLabel: string | null;
  mailboxEmail: string | null;
  customerId: string | null;
  companyId: string | null;
}

// Undismissed customer messages for an audience, newest first, with a resolved
// display name (company name / customer name / sender name / email).
export async function listCustomerMessages(
  audience: "b2b" | "consumer",
): Promise<CustomerMessageView[]> {
  const rows = await db
    .select({
      id: customerMessage.id,
      gmailMessageId: customerMessage.gmailMessageId,
      threadId: customerMessage.threadId,
      fromEmail: customerMessage.fromEmail,
      fromName: customerMessage.fromName,
      subject: customerMessage.subject,
      snippet: customerMessage.snippet,
      receivedAt: customerMessage.receivedAt,
      audience: customerMessage.audience,
      mailboxLabel: customerMessage.mailboxLabel,
      mailboxEmail: userTable.email,
      customerId: customerMessage.customerId,
      companyId: customerMessage.companyId,
      custFirst: customer.firstName,
      custLast: customer.lastName,
      coName: company.name,
    })
    .from(customerMessage)
    .leftJoin(customer, eq(customerMessage.customerId, customer.id))
    .leftJoin(company, eq(customerMessage.companyId, company.id))
    .leftJoin(userTable, eq(customerMessage.mailboxUserId, userTable.id))
    .where(
      and(
        eq(customerMessage.audience, audience),
        isNull(customerMessage.dismissedAt),
      ),
    )
    .orderBy(desc(customerMessage.receivedAt));

  return rows.map((r) => {
    const custName = [r.custFirst, r.custLast].filter(Boolean).join(" ").trim();
    const displayName = r.coName || custName || r.fromName || r.fromEmail;
    return {
      id: r.id,
      gmailMessageId: r.gmailMessageId,
      threadId: r.threadId,
      fromEmail: r.fromEmail,
      displayName,
      subject: r.subject,
      snippet: r.snippet,
      receivedAt: r.receivedAt,
      audience: r.audience,
      mailboxLabel: r.mailboxLabel,
      mailboxEmail: r.mailboxEmail,
      customerId: r.customerId,
      companyId: r.companyId,
    };
  });
}

export async function dismissCustomerMessage(
  id: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .update(customerMessage)
    .set({ dismissedAt: new Date() })
    .where(eq(customerMessage.id, id))
    .returning({ id: customerMessage.id });
  return row ?? null;
}

// Undismissed counts per audience for the nav dot.
export async function countNewCustomerMessages(): Promise<{
  b2b: number;
  consumer: number;
  total: number;
}> {
  const rows = await db
    .select({ audience: customerMessage.audience, n: count() })
    .from(customerMessage)
    .where(isNull(customerMessage.dismissedAt))
    .groupBy(customerMessage.audience);
  const b2b = rows.find((r) => r.audience === "b2b")?.n ?? 0;
  const consumer = rows.find((r) => r.audience === "consumer")?.n ?? 0;
  return { b2b, consumer, total: b2b + consumer };
}
