import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { attributionSurveyResponse, order } from "@/lib/schema";
import { mapAnswerToChannel, parseOtherSuffix } from "./channel-mapping";

// The JSON contract our webhook expects from Shopify Flow's "Send HTTP
// request" action. Tom maps the Grapevine "Response Completed" trigger
// variables into this shape in the Flow config. Keep this shape stable —
// the Flow body templating in Shopify Admin references these keys verbatim.
export const grapevineWebhookPayload = z.object({
  providerResponseId: z.string().min(1),
  surveyCode: z.string().optional().nullable(),
  surveyName: z.string().optional().nullable(),
  surface: z.string().optional().nullable(),
  questionKey: z.string().default("where_first_heard"),
  answer: z.string().optional().nullable(),
  isOther: z.boolean().optional().default(false),
  otherText: z.string().optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  shopifyOrderId: z.string().optional().nullable(),
  orderName: z.string().optional().nullable(),
  respondedAt: z.string().datetime().optional().nullable(),
});

export type GrapevineWebhookPayload = z.infer<typeof grapevineWebhookPayload>;

export type IngestResult =
  | { status: "stored"; id: string; orderResolved: boolean }
  | { status: "ignored"; reason: string };

// Upsert a Grapevine response keyed on (provider, provider_response_id).
// The same Shopify Flow run can be retried by Shopify (or replayed manually)
// without producing duplicate rows.
export async function ingestGrapevineResponse(
  payload: GrapevineWebhookPayload,
): Promise<IngestResult> {
  // Two upstream shapes:
  //   (a) Webhook: Tom configures Shopify Flow to set isOther + otherText
  //       explicitly from Grapevine's trigger variables.
  //   (b) CSV backfill: only a single answer string, where Grapevine encodes
  //       free-text "Other" responses as '<typed text> (* other)'.
  // parseOtherSuffix collapses (b) into the same shape as (a).
  let isOther = payload.isOther ?? false;
  let rawAnswer: string | null;
  if (isOther) {
    rawAnswer = payload.otherText ?? payload.answer ?? null;
  } else {
    const parsed = parseOtherSuffix(payload.answer ?? null);
    if (parsed.isOther) {
      isOther = true;
      rawAnswer = parsed.cleanedAnswer;
    } else {
      rawAnswer = parsed.cleanedAnswer ?? payload.answer ?? null;
    }
  }

  const mapped = isOther ? null : mapAnswerToChannel(rawAnswer);

  const orderId = payload.shopifyOrderId
    ? await resolveOrderId(payload.shopifyOrderId)
    : null;

  const respondedAt = payload.respondedAt ? new Date(payload.respondedAt) : null;

  const [row] = await db
    .insert(attributionSurveyResponse)
    .values({
      provider: "grapevine",
      providerResponseId: payload.providerResponseId,
      surveyCode: payload.surveyCode ?? null,
      surveyName: payload.surveyName ?? null,
      surface: payload.surface ?? null,
      orderId,
      shopifyOrderId: payload.shopifyOrderId ?? null,
      customerEmail: payload.customerEmail ?? null,
      questionKey: payload.questionKey,
      rawAnswer,
      isOtherText: isOther,
      platformHint: mapped?.platformHint ?? null,
      channelHint: mapped?.channelHint ?? null,
      channelDetail: mapped?.channelDetail ?? null,
      respondedAt,
    })
    .onConflictDoUpdate({
      target: [
        attributionSurveyResponse.provider,
        attributionSurveyResponse.providerResponseId,
      ],
      // Re-deliveries update everything except the immutable identity columns
      // — useful if a Flow re-run lands a corrected answer or a late order_id.
      set: {
        surveyCode: sql`excluded.survey_code`,
        surveyName: sql`excluded.survey_name`,
        surface: sql`excluded.surface`,
        orderId: sql`excluded.order_id`,
        shopifyOrderId: sql`excluded.shopify_order_id`,
        customerEmail: sql`excluded.customer_email`,
        questionKey: sql`excluded.question_key`,
        rawAnswer: sql`excluded.raw_answer`,
        isOtherText: sql`excluded.is_other_text`,
        platformHint: sql`excluded.platform_hint`,
        channelHint: sql`excluded.channel_hint`,
        channelDetail: sql`excluded.channel_detail`,
        respondedAt: sql`excluded.responded_at`,
      },
    })
    .returning({ id: attributionSurveyResponse.id });

  return { status: "stored", id: row.id, orderResolved: orderId !== null };
}

async function resolveOrderId(shopifyOrderId: string): Promise<string | null> {
  const [match] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.shopifyId, shopifyOrderId))
    .limit(1);
  return match?.id ?? null;
}

// Backfill resolver — runs over rows where orderId is null and the order has
// since been synced. Cheap to run after every Shopify cron extract.
export async function backfillUnresolvedOrders(): Promise<{ resolved: number }> {
  const unresolved = await db
    .select({
      id: attributionSurveyResponse.id,
      shopifyOrderId: attributionSurveyResponse.shopifyOrderId,
    })
    .from(attributionSurveyResponse)
    .where(
      sql`${attributionSurveyResponse.orderId} is null and ${attributionSurveyResponse.shopifyOrderId} is not null`,
    );

  let resolved = 0;
  for (const row of unresolved) {
    if (!row.shopifyOrderId) continue;
    const orderId = await resolveOrderId(row.shopifyOrderId);
    if (!orderId) continue;
    await db
      .update(attributionSurveyResponse)
      .set({ orderId })
      .where(eq(attributionSurveyResponse.id, row.id));
    resolved += 1;
  }
  return { resolved };
}
