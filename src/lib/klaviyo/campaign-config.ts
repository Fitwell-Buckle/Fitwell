/**
 * Zod schema for klaviyo/campaigns/<slug>/config.yaml.
 *
 * Strict: unknown keys cause a hard failure rather than being silently
 * dropped. Keeps drift between the YAML on disk and what we send to
 * Klaviyo from sneaking in.
 *
 * Phase 2 of specs/work-plans/todo/klaviyo-integration.md.
 */
import { z } from "zod";
import { parse as parseYaml } from "yaml";

const audiences = z
  .object({
    included: z.array(z.string().min(1)).min(1),
    excluded: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const campaignConfigSchema = z
  .object({
    subject: z.string().min(1),
    preview_text: z.string().optional(),
    from_email: z.string().email(),
    from_label: z.string().min(1),
    reply_to_email: z.string().email().optional(),
    audiences,
  })
  .strict();

export type CampaignConfig = z.infer<typeof campaignConfigSchema>;

export interface ParseCampaignConfigResult {
  config: CampaignConfig;
}

/**
 * Parses YAML and validates against the schema. Throws with a readable
 * message that names the offending field, so the CLI can print it
 * directly without further formatting.
 */
export function parseCampaignConfig(source: string): CampaignConfig {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (e) {
    throw new Error(
      `config.yaml is not valid YAML: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const parsed = campaignConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`config.yaml is invalid:\n${issues}`);
  }
  return parsed.data;
}
