import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

let client: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

// Test seam: lets unit tests inject a mock client.
export function __setAnthropicClientForTesting(c: Anthropic | null): void {
  client = c;
}

const VISION_MODEL = "claude-sonnet-4-5";
const EXTRACT_TOOL_NAME = "record_business_card";

export const BusinessCardSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  companyName: z.string().nullable(),
  website: z.string().nullable(),
  // Mailing address (often printed on the card). Optional so callers /
  // fixtures without these keys still validate; `region` = state/province.
  addressLine1: z.string().nullish(),
  addressLine2: z.string().nullish(),
  city: z.string().nullish(),
  region: z.string().nullish(),
  postalCode: z.string().nullish(),
  country: z.string().nullish(),
  confidence: z.object({
    firstName: z.number().min(0).max(1).optional(),
    lastName: z.number().min(0).max(1).optional(),
    email: z.number().min(0).max(1).optional(),
    phone: z.number().min(0).max(1).optional(),
    title: z.number().min(0).max(1).optional(),
    companyName: z.number().min(0).max(1).optional(),
    website: z.number().min(0).max(1).optional(),
  }),
  rawText: z.string(),
});

export type BusinessCard = z.infer<typeof BusinessCardSchema>;

export type SupportedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export interface ExtractBusinessCardInput {
  imageBase64: string;
  mediaType: SupportedImageMediaType;
}

const SYSTEM_PROMPT =
  "Extract business-card fields from the provided image. Use null for any field that is not clearly visible or unreadable. Never invent values. If a mailing address is printed on the card, split it into addressLine1 (street name + number), addressLine2 (suite/unit/floor, if any), city, region (state/province/region), postalCode, and country — leave any address part null when it isn't present, and keep the values exactly as printed so non-US/foreign addresses are preserved. Provide a 0–1 confidence per field (0 = missing/illegible, 1 = certain). Include the raw text you read off the card in `rawText` so a human reviewer can verify.";

const EXTRACT_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    firstName: { type: ["string", "null"] },
    lastName: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    companyName: { type: ["string", "null"] },
    website: { type: ["string", "null"] },
    addressLine1: { type: ["string", "null"] },
    addressLine2: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    region: { type: ["string", "null"] },
    postalCode: { type: ["string", "null"] },
    country: { type: ["string", "null"] },
    confidence: {
      type: "object",
      properties: {
        firstName: { type: "number" },
        lastName: { type: "number" },
        email: { type: "number" },
        phone: { type: "number" },
        title: { type: "number" },
        companyName: { type: "number" },
        website: { type: "number" },
      },
      additionalProperties: false,
    },
    rawText: { type: "string" },
  },
  required: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "title",
    "companyName",
    "website",
    "addressLine1",
    "addressLine2",
    "city",
    "region",
    "postalCode",
    "country",
    "confidence",
    "rawText",
  ],
  additionalProperties: false,
};

async function callVisionOnce(
  input: ExtractBusinessCardInput,
): Promise<unknown> {
  const result = await getAnthropic().messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: EXTRACT_TOOL_NAME,
        description:
          "Record the structured fields extracted from a business-card image.",
        input_schema: EXTRACT_TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: EXTRACT_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: "text",
            text: `Extract the fields from this business card and call ${EXTRACT_TOOL_NAME}.`,
          },
        ],
      },
    ],
  });

  const toolUse = result.content.find(
    (block) => block.type === "tool_use" && block.name === EXTRACT_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Anthropic response did not include a ${EXTRACT_TOOL_NAME} tool_use block`,
    );
  }
  return toolUse.input;
}

// Calls Claude Sonnet 4.5 vision to extract structured fields from a
// business-card image. Retries once if the model's tool input fails Zod
// validation; surfaces the original error if both attempts fail.
export async function extractBusinessCard(
  input: ExtractBusinessCardInput,
): Promise<BusinessCard> {
  let firstError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callVisionOnce(input);
    const parsed = BusinessCardSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    if (firstError === null) firstError = parsed.error;
  }
  throw firstError instanceof Error
    ? firstError
    : new Error("extractBusinessCard: validation failed");
}

// ─── Follow-up email drafting ───────────────────────────────────────

const TEXT_MODEL = "claude-sonnet-4-5";
const DRAFT_TOOL_NAME = "record_followup_email";

export const FollowupEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type FollowupEmail = z.infer<typeof FollowupEmailSchema>;

export interface DraftFollowupInput {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  title?: string | null;
  stage?: string | null;
  notes?: string | null;
  // The Fitwell rep's name, for the sign-off, if known.
  fromName?: string | null;
  // When true, this is a 2nd follow-up (~2 weeks later, no reply yet): a
  // shorter, gentle nudge that acknowledges the prior unanswered email.
  isNudge?: boolean;
}

const DRAFT_SYSTEM_PROMPT = [
  "You write short, warm B2B follow-up emails for Fitwell Buckle Co., a maker",
  "of precision micro-adjust watch buckles. The email follows up after meeting",
  "someone (often at a trade show) whose business card was just captured.",
  "",
  "Rules:",
  "- Ground the email in the rep's NOTES about the conversation — reference the",
  "  specific interest/next step they recorded. If notes are empty, write a brief",
  "  generic 'great to meet you' follow-up.",
  "- Keep it under ~120 words, plain and friendly, no marketing fluff.",
  "- One clear next step (e.g. send samples, schedule a call) when the notes imply one.",
  "- Do NOT invent facts, prices, or commitments not in the notes.",
  "- Address the person by first name if available.",
  "- Sign off from the rep's name if given, otherwise 'The Fitwell Buckle Co. team'.",
  "- `subject` is a short subject line; `body` is plain text (no HTML), with line breaks.",
].join("\n");

const DRAFT_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

function contactSummary(input: DraftFollowupInput): string {
  const lines = [
    `Name: ${[input.firstName, input.lastName].filter(Boolean).join(" ") || "(unknown)"}`,
    `Title: ${input.title || "(unknown)"}`,
    `Company: ${input.companyName || "(unknown)"}`,
    `Pipeline stage: ${input.stage || "lead"}`,
    `Rep's name (sign-off): ${input.fromName || "(unknown — use the team sign-off)"}`,
    "",
    "Notes from the conversation:",
    input.notes?.trim() || "(no notes recorded)",
  ];
  return lines.join("\n");
}

const NUDGE_GUIDANCE = [
  "",
  "THIS IS A SECOND FOLLOW-UP, ~2 weeks after the first email, which went",
  "unanswered. Keep it especially short and low-pressure: briefly reference the",
  "earlier note, make it easy to reply, and offer a graceful out (e.g. 'if now",
  "isn't the right time, just let me know'). Do not guilt-trip or repeat the",
  "whole pitch.",
].join("\n");

async function callDraftOnce(input: DraftFollowupInput): Promise<unknown> {
  const result = await getAnthropic().messages.create({
    model: TEXT_MODEL,
    max_tokens: 1024,
    system: input.isNudge
      ? DRAFT_SYSTEM_PROMPT + "\n" + NUDGE_GUIDANCE
      : DRAFT_SYSTEM_PROMPT,
    tools: [
      {
        name: DRAFT_TOOL_NAME,
        description: "Record the drafted follow-up email (subject + body).",
        input_schema: DRAFT_TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: DRAFT_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Draft a follow-up email for this contact and call ${DRAFT_TOOL_NAME}.\n\n${contactSummary(input)}`,
          },
        ],
      },
    ],
  });

  const toolUse = result.content.find(
    (block) => block.type === "tool_use" && block.name === DRAFT_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Anthropic response did not include a ${DRAFT_TOOL_NAME} tool_use block`,
    );
  }
  return toolUse.input;
}

// Draft a follow-up email from a lead's notes + context. Retries once if the
// model's output fails validation.
export async function draftFollowupEmail(
  input: DraftFollowupInput,
): Promise<FollowupEmail> {
  let firstError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callDraftOnce(input);
    const parsed = FollowupEmailSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    if (firstError === null) firstError = parsed.error;
  }
  throw firstError instanceof Error
    ? firstError
    : new Error("draftFollowupEmail: validation failed");
}

export const DRAFT_MODEL_NAME = TEXT_MODEL;

// ─── Reply drafting (compose a response to an inbound email) ─────────

const REPLY_TOOL_NAME = "record_reply_email";

export interface DraftReplyInput {
  // The sender we're replying to (their display name, if known).
  contactName?: string | null;
  // What they sent us.
  theirSubject?: string | null;
  theirMessage?: string | null;
  // Who they are to us — tunes the tone.
  relationship?: "customer" | "b2b_customer" | "lead" | "supplier";
  // The Fitwell rep's name for the sign-off, if known.
  fromName?: string | null;
}

const REPLY_SYSTEM_PROMPT = [
  "You help Fitwell Buckle Co. (maker of precision micro-adjust watch buckles)",
  "write a reply to an email someone sent us. Ground the reply in THEIR message",
  "— answer what they asked or acknowledge what they said. Keep it concise,",
  "warm and plain (under ~140 words), with one clear next step when appropriate.",
  "Do NOT invent prices, order details, ship dates, or commitments not present in",
  "their message — if you don't know something, say you'll check and follow up.",
  "Address them by first name if known. Sign off from the rep's name if given,",
  "otherwise 'The Fitwell Buckle Co. team'. `subject` should be the reply subject",
  "(use 'Re: <their subject>' when their subject is given); `body` is plain text.",
].join("\n");

function replySummary(input: DraftReplyInput): string {
  return [
    `From: ${input.contactName || "(unknown)"}`,
    `They are: ${input.relationship ?? "customer"}`,
    `Rep's name (sign-off): ${input.fromName || "(unknown — use the team sign-off)"}`,
    `Their subject: ${input.theirSubject || "(none)"}`,
    "",
    "Their message:",
    input.theirMessage?.trim() || "(no body available — write a brief, helpful acknowledgement)",
  ].join("\n");
}

async function callReplyOnce(input: DraftReplyInput): Promise<unknown> {
  const result = await getAnthropic().messages.create({
    model: TEXT_MODEL,
    max_tokens: 1024,
    system: REPLY_SYSTEM_PROMPT,
    tools: [
      {
        name: REPLY_TOOL_NAME,
        description: "Record the drafted reply email (subject + body).",
        input_schema: DRAFT_TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: REPLY_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Draft a reply and call ${REPLY_TOOL_NAME}.\n\n${replySummary(input)}`,
          },
        ],
      },
    ],
  });

  const toolUse = result.content.find(
    (block) => block.type === "tool_use" && block.name === REPLY_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Anthropic response did not include a ${REPLY_TOOL_NAME} tool_use block`,
    );
  }
  return toolUse.input;
}

// Draft a reply to an inbound email. Retries once on validation failure.
export async function draftReply(
  input: DraftReplyInput,
): Promise<FollowupEmail> {
  let firstError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callReplyOnce(input);
    const parsed = FollowupEmailSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    if (firstError === null) firstError = parsed.error;
  }
  throw firstError instanceof Error
    ? firstError
    : new Error("draftReply: validation failed");
}
