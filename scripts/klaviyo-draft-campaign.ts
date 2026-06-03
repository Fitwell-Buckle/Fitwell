/**
 * CLI: deploy a campaign draft to Klaviyo from
 *   klaviyo/campaigns/<slug>/{template.mjml, config.yaml}
 *
 * Usage:
 *   npm run klaviyo:campaign:draft <slug>
 *
 * Reads the template + config, compiles MJML, injects UTMs
 * (utm_campaign=<slug>), then calls the Phase 2 draftCampaign
 * orchestrator. Idempotent by campaign name — re-runs update the
 * existing draft. Never sends; sending is a manual action in Klaviyo's
 * UI.
 *
 * Phase 2 of specs/work-plans/todo/klaviyo-integration.md.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { KlaviyoClient } from "../src/lib/klaviyo/client";
import { parseCampaignConfig } from "../src/lib/klaviyo/campaign-config";
import { compileMjml, injectUtms } from "../src/lib/klaviyo/templates";
import {
  draftCampaign,
  CampaignAlreadySentError,
} from "../src/lib/klaviyo/draft-campaign";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npm run klaviyo:campaign:draft <slug>");
    process.exit(2);
  }
  if (!SLUG_RE.test(slug)) {
    console.error(
      `Invalid slug "${slug}" — use lowercase kebab-case, e.g. "2026-06-collectors-bundle"`,
    );
    process.exit(2);
  }

  const dir = join("klaviyo", "campaigns", slug);
  const configPath = join(dir, "config.yaml");
  const templatePath = join(dir, "template.mjml");
  if (!existsSync(configPath) || !existsSync(templatePath)) {
    console.error(
      `Missing config or template in ${dir}/.\n` +
        `Expected: ${configPath} and ${templatePath}`,
    );
    process.exit(2);
  }

  const config = parseCampaignConfig(readFileSync(configPath, "utf8"));
  const mjmlSource = readFileSync(templatePath, "utf8");

  const { html: rawHtml, warnings } = await compileMjml(mjmlSource);
  if (warnings.length > 0) {
    console.warn(`MJML warnings for ${slug}:`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }
  if (!rawHtml) {
    console.error("MJML compiled to empty HTML — aborting");
    process.exit(1);
  }
  const html = injectUtms(rawHtml, { campaign: slug, content: "blast" });

  const client = new KlaviyoClient();
  try {
    const result = await draftCampaign({ slug, config, html, client });
    console.log(`✓ Campaign ${result.mode}: ${slug}`);
    console.log(`  Campaign ID: ${result.campaignId}`);
    console.log(`  Template ID: ${result.templateId}`);
    console.log(`  Review + send: ${result.klaviyoUrl}`);
  } catch (e) {
    if (e instanceof CampaignAlreadySentError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
