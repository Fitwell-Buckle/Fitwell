/**
 * Pure orchestrator for the Phase 2 campaign draft workflow. Takes a
 * config + compiled HTML + Klaviyo client and produces a draft
 * campaign in Klaviyo. Idempotent on campaign name: a second run with
 * the same slug updates the existing draft in place rather than
 * creating a duplicate.
 *
 * Hard contract: this code never causes a campaign to send. Klaviyo
 * defaults newly-created campaigns to `draft`; sending requires a
 * manual action in Klaviyo's UI.
 *
 * Phase 2 of specs/work-plans/todo/klaviyo-integration.md.
 */
import type { KlaviyoClient } from "./client";
import type { CampaignConfig } from "./campaign-config";

export interface DraftCampaignInput {
  /** Campaign slug — also the campaign name in Klaviyo + template name */
  slug: string;
  config: CampaignConfig;
  /** Final compiled + UTM-injected HTML for the email body */
  html: string;
  client: KlaviyoClient;
  /**
   * Pass false for a daily newsletter so Klaviyo doesn't suppress
   * subscribers who happened to get another email in the last ~16h.
   * Omitted → Klaviyo's default (smart sending on).
   */
  useSmartSending?: boolean;
}

export interface DraftCampaignResult {
  campaignId: string;
  templateId: string;
  messageId: string;
  /** Whether we created a new campaign or updated an existing draft */
  mode: "created" | "updated";
  /** URL to view the draft in Klaviyo's UI */
  klaviyoUrl: string;
}

export class CampaignAlreadySentError extends Error {
  constructor(
    public readonly slug: string,
    public readonly status: string,
  ) {
    super(
      `Refusing to overwrite campaign "${slug}" — Klaviyo status is "${status}", not "draft". ` +
        `If you want to iterate on a sent campaign, rename the slug.`,
    );
    this.name = "CampaignAlreadySentError";
  }
}

/**
 * Idempotent campaign-draft workflow:
 *   1. Compile + UTM-inject already done — `html` is final.
 *   2. Look up template by name (= slug). Create or PATCH.
 *   3. Look up campaign by name (= slug). If draft, PATCH; if not draft,
 *      abort (don't overwrite a sent campaign). Else, create fresh.
 *   4. Assign the template to the campaign's message. Klaviyo clones
 *      the template into the message, so we re-assign on every run to
 *      pick up template changes.
 */
export async function draftCampaign(
  input: DraftCampaignInput,
): Promise<DraftCampaignResult> {
  const { slug, config, html, client, useSmartSending } = input;

  // 1. Template — upsert by name.
  const existingTemplate = await client.getTemplateByName(slug);
  const template = existingTemplate
    ? await client.updateTemplate({
        id: existingTemplate.id,
        name: slug,
        html,
      })
    : await client.createTemplate({ name: slug, html });

  // 2. Campaign — look up by name, decide create vs. update.
  const existingCampaign = await client.getCampaignByName(slug);
  let campaignId: string;
  let messageId: string;
  let mode: "created" | "updated";

  if (existingCampaign) {
    if (existingCampaign.status !== "Draft" && existingCampaign.status !== "draft") {
      throw new CampaignAlreadySentError(slug, existingCampaign.status);
    }
    if (!existingCampaign.messageId) {
      throw new Error(
        `Existing draft campaign "${slug}" (${existingCampaign.id}) has no campaign-message — manual repair needed in Klaviyo`,
      );
    }
    await client.updateCampaignDraft({
      id: existingCampaign.id,
      name: slug,
      audiencesIncluded: config.audiences.included,
      audiencesExcluded: config.audiences.excluded,
    });
    campaignId = existingCampaign.id;
    messageId = existingCampaign.messageId;
    mode = "updated";
  } else {
    const created = await client.createCampaign({
      name: slug,
      audiencesIncluded: config.audiences.included,
      audiencesExcluded: config.audiences.excluded,
      subject: config.subject,
      previewText: config.preview_text,
      fromEmail: config.from_email,
      fromLabel: config.from_label,
      replyToEmail: config.reply_to_email,
      useSmartSending,
    });
    campaignId = created.id;
    messageId = created.messageId;
    mode = "created";
  }

  // 3. Re-assign template every run so template edits propagate.
  await client.assignTemplateToCampaignMessage({
    campaignMessageId: messageId,
    templateId: template.id,
  });

  return {
    campaignId,
    templateId: template.id,
    messageId,
    mode,
    klaviyoUrl: `https://www.klaviyo.com/campaign/${campaignId}/edit`,
  };
}
