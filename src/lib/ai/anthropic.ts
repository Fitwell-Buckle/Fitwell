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
  "Extract business-card fields from the provided image. Use null for any field that is not clearly visible or unreadable. Never invent values. Provide a 0–1 confidence per field (0 = missing/illegible, 1 = certain). Include the raw text you read off the card in `rawText` so a human reviewer can verify.";

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
