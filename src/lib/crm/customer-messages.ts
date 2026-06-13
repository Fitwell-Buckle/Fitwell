import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { createAdminNotification } from "@/lib/notifications/admin-notify";
import {
  company,
  companyContact,
  customer,
  customerMessage,
  influencer,
  influencerContact,
  supplier,
  supplierContact,
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
  const [
    companyRows,
    contactRows,
    customerRows,
    supplierRows,
    supContactRows,
    influencerRows,
    infContactRows,
  ] = await Promise.all([
    db.select({ id: company.id, email: company.contactEmail }).from(company),
    db
      .select({ companyId: companyContact.companyId, email: companyContact.email })
      .from(companyContact),
    db.select({ id: customer.id, email: customer.email }).from(customer),
    db.select({ id: supplier.id, email: supplier.contactEmail }).from(supplier),
    db
      .select({ supplierId: supplierContact.supplierId, email: supplierContact.email })
      .from(supplierContact),
    db.select({ id: influencer.id, email: influencer.contactEmail }).from(influencer),
    db
      .select({ influencerId: influencerContact.influencerId, email: influencerContact.email })
      .from(influencerContact),
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
  const supplierByEmail = new Map<string, string>();
  for (const r of supplierRows) {
    if (r.email) supplierByEmail.set(r.email.toLowerCase(), r.id);
  }
  for (const r of supContactRows) {
    if (r.email) supplierByEmail.set(r.email.toLowerCase(), r.supplierId);
  }
  const influencerByEmail = new Map<string, string>();
  for (const r of influencerRows) {
    if (r.email) influencerByEmail.set(r.email.toLowerCase(), r.id);
  }
  for (const r of infContactRows) {
    if (r.email) influencerByEmail.set(r.email.toLowerCase(), r.influencerId);
  }
  return { companyByEmail, customerByEmail, supplierByEmail, influencerByEmail };
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
  if (
    index.companyByEmail.size === 0 &&
    index.customerByEmail.size === 0 &&
    (index.supplierByEmail?.size ?? 0) === 0 &&
    (index.influencerByEmail?.size ?? 0) === 0
  ) {
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
          supplierId: match.supplierId,
          influencerId: match.influencerId,
        })
        .onConflictDoNothing({ target: customerMessage.gmailMessageId })
        .returning({ id: customerMessage.id });

      if (rows.length === 0) continue; // already recorded
      inserted++;

      const who = match.name || match.email;
      const href =
        match.audience === "supplier"
          ? "/modules/production/suppliers"
          : match.audience === "influencer"
            ? "/influencers"
            : match.audience === "b2b"
              ? "/customers/brands"
              : "/customers";
      await createAdminNotification({
        type: "customer_message",
        title: `New message from ${who}`,
        // Richer preview: subject + snippet when both are present.
        body: [m.subject, m.snippet].filter(Boolean).join(" — ") || null,
        href,
        mailboxLabel: mb.label,
        mailboxEmail: mb.email,
      });
    }
  }
  return { scanned, inserted };
}

// Matcher that flags internal/Fitwell senders. Used to defensively exclude
// our own mail at read time — covers rows recorded before the detection-side
// internal filter existed (e.g. a teammate who is also a Shopify customer).
async function isInternalSenderMatcher() {
  const mailboxes = await listConnectedMailboxes();
  return buildInternalEmailMatcher([
    ...mailboxes.map((m) => m.email),
    ...(process.env.ADMIN_EMAILS ?? "").split(","),
  ]);
}

export interface CustomerMessageView {
  id: string;
  gmailMessageId: string;
  threadId: string | null;
  fromEmail: string;
  displayName: string;
  company: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: Date | null;
  audience: string;
  mailboxLabel: string | null;
  mailboxEmail: string | null;
  customerId: string | null;
  companyId: string | null;
  supplierId: string | null;
  influencerId: string | null;
}

// Undismissed customer messages for an audience, newest first, with a resolved
// display name (company / supplier / influencer / customer name / sender / email).
export async function listCustomerMessages(
  audience: "b2b" | "consumer" | "supplier" | "influencer",
): Promise<CustomerMessageView[]> {
  // The company can be matched directly (B2B message → companyId) OR inferred
  // from the matched customer's own company link (a consumer who belongs to a
  // company) — resolve both via a second aliased company join.
  const customerCompany = alias(company, "customer_company");
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
      supplierId: customerMessage.supplierId,
      influencerId: customerMessage.influencerId,
      custFirst: customer.firstName,
      custLast: customer.lastName,
      coName: company.name,
      custCoName: customerCompany.name,
      supName: supplier.name,
      infName: influencer.name,
    })
    .from(customerMessage)
    .leftJoin(customer, eq(customerMessage.customerId, customer.id))
    .leftJoin(company, eq(customerMessage.companyId, company.id))
    .leftJoin(customerCompany, eq(customer.companyId, customerCompany.id))
    .leftJoin(supplier, eq(customerMessage.supplierId, supplier.id))
    .leftJoin(influencer, eq(customerMessage.influencerId, influencer.id))
    .leftJoin(userTable, eq(customerMessage.mailboxUserId, userTable.id))
    .where(
      and(
        eq(customerMessage.audience, audience),
        isNull(customerMessage.dismissedAt),
      ),
    )
    .orderBy(desc(customerMessage.receivedAt));

  const isInternal = await isInternalSenderMatcher();

  return rows
    .filter((r) => !isInternal(r.fromEmail))
    .map((r) => {
    const custName = [r.custFirst, r.custLast].filter(Boolean).join(" ").trim();
    const displayName =
      r.coName || r.supName || r.infName || custName || r.fromName || r.fromEmail;
    return {
      id: r.id,
      gmailMessageId: r.gmailMessageId,
      threadId: r.threadId,
      fromEmail: r.fromEmail,
      displayName,
      company: r.coName ?? r.custCoName ?? null,
      subject: r.subject,
      snippet: r.snippet,
      receivedAt: r.receivedAt,
      audience: r.audience,
      mailboxLabel: r.mailboxLabel,
      mailboxEmail: r.mailboxEmail,
      customerId: r.customerId,
      companyId: r.companyId,
      supplierId: r.supplierId,
      influencerId: r.influencerId,
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
  supplier: number;
  influencer: number;
  total: number;
}> {
  const [rows, isInternal] = await Promise.all([
    db
      .select({
        audience: customerMessage.audience,
        fromEmail: customerMessage.fromEmail,
      })
      .from(customerMessage)
      .where(isNull(customerMessage.dismissedAt)),
    isInternalSenderMatcher(),
  ]);
  const tally = { b2b: 0, consumer: 0, supplier: 0, influencer: 0 };
  for (const r of rows) {
    if (isInternal(r.fromEmail)) continue;
    if (r.audience in tally) tally[r.audience as keyof typeof tally]++;
  }
  const { b2b, consumer, supplier, influencer } = tally;
  return {
    b2b,
    consumer,
    supplier,
    influencer,
    total: b2b + consumer + supplier + influencer,
  };
}
