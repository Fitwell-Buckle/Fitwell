import { z } from "zod";
import { and, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { company, companyContact, lead, leadCardImage } from "@/lib/schema";
import {
  LEAD_PERSONA_TAGS,
  LEAD_SOURCE_CHANNELS,
  LEAD_STAGES,
  LEAD_STATUSES,
} from "./constants";
import { companyEmailDomain } from "./email";
import { toNameCase } from "./names";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

// ─── Lead ───────────────────────────────────────────────────────────

const confidenceSchema = z.record(z.string(), z.number().min(0).max(1));

// Used by POST /api/leads. Source + at-least-one-identity required so we
// don't accidentally save a blank row from a misfired capture.
export const createLeadSchema = z
  .object({
    firstName: z.string().max(200).nullish(),
    lastName: z.string().max(200).nullish(),
    email: z.string().email().max(320).nullish().or(z.literal("")),
    phone: z.string().max(50).nullish(),
    title: z.string().max(200).nullish(),
    companyName: z.string().max(200).nullish(),
    stage: z.enum(LEAD_STAGES).optional(),
    personaTag: z.enum(LEAD_PERSONA_TAGS).nullish(),
    sourceChannel: z.enum(LEAD_SOURCE_CHANNELS),
    meetingDate: dateString.nullish(),
    ownerUserId: z.string().max(200).nullish(),
    // Auto-linked when the capture flow's domain match surfaces a company.
    companyId: z.string().max(200).nullish(),
    notes: z.string().max(10_000).nullish(),
    cardImageUrl: z.string().url().max(2000).nullish(),
    cardRawText: z.string().max(10_000).nullish(),
    ocrConfidence: confidenceSchema.nullish(),
  })
  .refine(
    (v) =>
      Boolean(
        v.firstName || v.lastName || v.email || v.phone || v.companyName,
      ),
    {
      message: "at least one of name/email/phone/company is required",
      path: ["firstName"],
    },
  );
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// Used by PATCH /api/leads/[id]. All optional; status here is the
// non-destructive transition path (use dropLead() for soft-delete).
export const updateLeadSchema = z.object({
  firstName: z.string().max(200).nullish(),
  lastName: z.string().max(200).nullish(),
  email: z.string().email().max(320).nullish().or(z.literal("")),
  phone: z.string().max(50).nullish(),
  title: z.string().max(200).nullish(),
  companyName: z.string().max(200).nullish(),
  stage: z.enum(LEAD_STAGES).optional(),
  personaTag: z.enum(LEAD_PERSONA_TAGS).nullish(),
  sourceChannel: z.enum(LEAD_SOURCE_CHANNELS).optional(),
  meetingDate: dateString.nullish(),
  ownerUserId: z.string().max(200).nullish(),
  notes: z.string().max(10_000).nullish(),
  companyId: z.string().max(200).nullish(),
  status: z.enum(LEAD_STATUSES).optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export interface CreateLeadOptions {
  capturedByUserId: string;
  // If the caller omits ownerUserId, default it to the capturing user so
  // every lead has someone responsible for follow-up.
  defaultOwnerToCapturer?: boolean;
}

export async function createLead(
  input: CreateLeadInput,
  opts: CreateLeadOptions,
): Promise<{ id: string }> {
  const ownerUserId =
    input.ownerUserId ||
    (opts.defaultOwnerToCapturer === false ? null : opts.capturedByUserId);

  const [row] = await db
    .insert(lead)
    .values({
      capturedByUserId: opts.capturedByUserId,
      firstName: toNameCase(input.firstName),
      lastName: toNameCase(input.lastName),
      email: input.email || null,
      phone: input.phone || null,
      title: input.title || null,
      companyName: input.companyName || null,
      stage: input.stage ?? "prospect",
      personaTag: input.personaTag || null,
      sourceChannel: input.sourceChannel,
      meetingDate: input.meetingDate || null,
      ownerUserId,
      companyId: input.companyId || null,
      notes: input.notes || null,
      cardImageUrl: input.cardImageUrl || null,
      cardRawText: input.cardRawText || null,
      ocrConfidence: input.ocrConfidence ?? null,
    })
    .returning({ id: lead.id });

  // Persist the card image (if any) into history so re-scans accumulate.
  if (input.cardImageUrl) {
    await db.insert(leadCardImage).values({
      leadId: row.id,
      blobUrl: input.cardImageUrl,
      uploadedByUserId: opts.capturedByUserId,
    });
  }
  return { id: row.id };
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
): Promise<{ id: string } | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.firstName !== undefined)
    patch.firstName = toNameCase(input.firstName);
  if (input.lastName !== undefined)
    patch.lastName = toNameCase(input.lastName);
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.title !== undefined) patch.title = input.title || null;
  if (input.companyName !== undefined)
    patch.companyName = input.companyName || null;
  if (input.stage !== undefined) patch.stage = input.stage;
  if (input.personaTag !== undefined)
    patch.personaTag = input.personaTag || null;
  if (input.sourceChannel !== undefined)
    patch.sourceChannel = input.sourceChannel;
  if (input.meetingDate !== undefined)
    patch.meetingDate = input.meetingDate || null;
  if (input.ownerUserId !== undefined)
    patch.ownerUserId = input.ownerUserId || null;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.companyId !== undefined) patch.companyId = input.companyId || null;
  if (input.status !== undefined) patch.status = input.status;

  const [row] = await db
    .update(lead)
    .set(patch)
    .where(eq(lead.id, id))
    .returning({ id: lead.id });
  return row ?? null;
}

// Mark that the lead emailed us back (stops the follow-up nudge). Idempotent.
export async function setLeadReplied(
  id: string,
  when: Date,
): Promise<void> {
  await db
    .update(lead)
    .set({ repliedAt: when, updatedAt: new Date() })
    .where(eq(lead.id, id));
}

// Mark the lead's Replies tab as viewed now (clears the "new replies" dot).
export async function setLeadRepliesSeen(id: string): Promise<void> {
  await db
    .update(lead)
    .set({ repliesSeenAt: new Date() })
    .where(eq(lead.id, id));
}

// Active leads with an email + an owner to check for inbound replies. Used by
// the reply-detection cron. Capped; newest first.
export interface ReplyCheckLead {
  id: string;
  email: string | null;
  ownerUserId: string | null;
  capturedByUserId: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  createdAt: Date | null;
  repliesNotifiedAt: Date | null;
}

export async function listLeadsForReplyCheck(
  limit = 50,
): Promise<ReplyCheckLead[]> {
  const rows = await db
    .select({
      id: lead.id,
      email: lead.email,
      ownerUserId: lead.ownerUserId,
      capturedByUserId: lead.capturedByUserId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      companyName: lead.companyName,
      createdAt: lead.createdAt,
      repliesNotifiedAt: lead.repliesNotifiedAt,
    })
    .from(lead)
    .where(and(eq(lead.status, "active"), sql`${lead.email} is not null`))
    .orderBy(desc(lead.capturedAt))
    .limit(limit);
  return rows;
}

// Record that we notified about a reply for this lead (and that it replied).
export async function markLeadReplyNotified(
  id: string,
  when: Date,
): Promise<void> {
  await db
    .update(lead)
    .set({ repliesNotifiedAt: when, repliedAt: when, updatedAt: new Date() })
    .where(eq(lead.id, id));
}

// Soft delete: flip status to 'dropped'. History is preserved.
export async function dropLead(id: string): Promise<{ id: string } | null> {
  const [row] = await db
    .update(lead)
    .set({ status: "dropped", updatedAt: new Date() })
    .where(eq(lead.id, id))
    .returning({ id: lead.id });
  return row ?? null;
}

export async function getLead(id: string) {
  return db.query.lead.findFirst({ where: eq(lead.id, id) });
}

export interface ListLeadsFilters {
  stage?: string;
  sourceChannel?: string;
  ownerUserId?: string;
  status?: string;
  search?: string;
}

// ─── Email-domain → company / lead matching ────────────────────────

export interface CompanyMatch {
  id: string;
  name: string;
  // The contact email(s) on this company that shared the matched domain
  // (one or more) — surfaced so the UI can show "matched on alice@acme.com".
  matchedEmails: string[];
}

// Find a company whose contact emails share the given domain. Scans both
// `company.contact_email` (the brand's primary contact) and every row in
// `company_contact` (portal allowlist). Returns at most one match — if two
// companies happen to share a domain, returns the older one and the caller
// should let the user manually disambiguate.
export async function findCompanyByEmailDomain(
  domain: string,
): Promise<CompanyMatch | null> {
  const d = domain.trim().toLowerCase();
  if (!d) return null;
  const pattern = `%@${d}`;

  // Primary contact email on company row itself.
  const direct = await db
    .select({
      id: company.id,
      name: company.name,
      email: company.contactEmail,
      createdAt: company.createdAt,
    })
    .from(company)
    .where(ilike(company.contactEmail, pattern))
    .orderBy(company.createdAt)
    .limit(5);

  // Allowlist email rows.
  const viaContacts = await db
    .select({
      id: company.id,
      name: company.name,
      email: companyContact.email,
      createdAt: company.createdAt,
    })
    .from(companyContact)
    .innerJoin(company, eq(companyContact.companyId, company.id))
    .where(ilike(companyContact.email, pattern))
    .orderBy(company.createdAt)
    .limit(5);

  const byCompany = new Map<
    string,
    { id: string; name: string; emails: Set<string>; createdAt: Date | null }
  >();
  for (const row of [...direct, ...viaContacts]) {
    if (!row.email) continue;
    const existing = byCompany.get(row.id);
    if (existing) existing.emails.add(row.email.toLowerCase());
    else
      byCompany.set(row.id, {
        id: row.id,
        name: row.name,
        emails: new Set([row.email.toLowerCase()]),
        createdAt: row.createdAt ?? null,
      });
  }

  if (byCompany.size === 0) return null;

  const sorted = [...byCompany.values()].sort((a, b) => {
    const ta = a.createdAt?.getTime() ?? 0;
    const tb = b.createdAt?.getTime() ?? 0;
    return ta - tb;
  });
  const winner = sorted[0];
  return {
    id: winner.id,
    name: winner.name,
    matchedEmails: [...winner.emails],
  };
}

export interface LeadMatch {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyId: string | null;
  stage: string;
  status: string;
}

// Find an active lead with the same email (case-insensitive). When
// `companyId` is provided, the match is scoped to that company; otherwise
// the search is global. `excludeLeadId` lets the caller skip a known row
// (e.g. when editing).
export async function findActiveLeadByEmail(
  email: string,
  opts: { companyId?: string | null; excludeLeadId?: string | null } = {},
): Promise<LeadMatch | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const conds: SQL[] = [
    sql`lower(${lead.email}) = ${e}`,
    eq(lead.status, "active"),
  ];
  if (opts.companyId) conds.push(eq(lead.companyId, opts.companyId));
  if (opts.excludeLeadId) conds.push(ne(lead.id, opts.excludeLeadId));

  const rows = await db
    .select({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      companyId: lead.companyId,
      stage: lead.stage,
      status: lead.status,
    })
    .from(lead)
    .where(and(...conds))
    .orderBy(desc(lead.capturedAt))
    .limit(1);
  return rows[0] ?? null;
}

export interface MatchResult {
  matchedCompany: CompanyMatch | null;
  matchedLead: LeadMatch | null;
  // The corporate-shaped domain we matched on. Null when the email belongs
  // to a free provider (gmail.com etc.) or isn't an email at all.
  matchedDomain: string | null;
}

// Bundled lookup used by the capture flow: from an extracted email, decide
// whether there's already a company to link the lead to and whether a lead
// already exists for that person. Free-email-provider domains are ignored
// for company matching but still drive lead dedup.
export async function matchByEmail(email: string): Promise<MatchResult> {
  const domain = companyEmailDomain(email);
  const matchedCompany = domain
    ? await findCompanyByEmailDomain(domain)
    : null;
  const matchedLead = await findActiveLeadByEmail(email, {
    companyId: matchedCompany?.id ?? null,
  });
  return { matchedCompany, matchedLead, matchedDomain: domain };
}

// ─── Card-image history ────────────────────────────────────────────

export interface AddLeadCardImageInput {
  leadId: string;
  blobUrl: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  uploadedByUserId?: string | null;
}

// Record a card image scan against a lead. Also bumps `lead.card_image_url`
// to the new url so the lead detail page always shows the most-recent card.
export async function addLeadCardImage(
  input: AddLeadCardImageInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(leadCardImage)
    .values({
      leadId: input.leadId,
      blobUrl: input.blobUrl,
      contentType: input.contentType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
    })
    .returning({ id: leadCardImage.id });
  await db
    .update(lead)
    .set({ cardImageUrl: input.blobUrl, updatedAt: new Date() })
    .where(eq(lead.id, input.leadId));
  return { id: row.id };
}

export async function listLeadCardImages(leadId: string) {
  return db
    .select()
    .from(leadCardImage)
    .where(eq(leadCardImage.leadId, leadId))
    .orderBy(desc(leadCardImage.uploadedAt));
}

export async function listLeads(filters: ListLeadsFilters = {}) {
  const conds: SQL[] = [];

  // Default to active-only — callers must opt in to dropped/converted views.
  conds.push(eq(lead.status, filters.status ?? "active"));

  if (filters.stage) conds.push(eq(lead.stage, filters.stage));
  if (filters.sourceChannel)
    conds.push(eq(lead.sourceChannel, filters.sourceChannel));
  if (filters.ownerUserId)
    conds.push(eq(lead.ownerUserId, filters.ownerUserId));

  if (filters.search) {
    const q = `%${filters.search}%`;
    const searchCond = or(
      ilike(lead.firstName, q),
      ilike(lead.lastName, q),
      ilike(lead.email, q),
      ilike(lead.companyName, q),
    );
    if (searchCond) conds.push(searchCond);
  }

  return db
    .select()
    .from(lead)
    .where(and(...conds))
    .orderBy(desc(lead.capturedAt));
}
