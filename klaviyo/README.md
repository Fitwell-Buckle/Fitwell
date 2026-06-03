# Klaviyo (write side, Phases 1–4)

This directory holds the **source** for Klaviyo campaigns and flows that
ship from this repo. Phase 0 (read-side measurement) lives elsewhere
(`src/lib/klaviyo/`, `/api/cron/extract-klaviyo`). Phase 1 (this) only
ships the local pipeline — no Klaviyo writes happen until Phase 2.

> **Status:** Phase 1 (MJML pipeline) is live. Phases 2–4 (deploy scripts) not built yet — see `specs/work-plans/todo/klaviyo-integration.md`.

## Layout

```
klaviyo/
  templates/<slug>/template.mjml      # reusable email bodies (Phase 1)
  campaigns/<slug>/                    # Phase 2 — one-shot sends
    template.mjml
    config.yaml
  flows/<name>.yaml                    # Phase 4 — multi-step automations
```

- **templates/** — standalone MJML files for one-off rendering / testing.
  Not deployed on their own; campaigns and flows reference these.
- **campaigns/** — each `<slug>/` is one Klaviyo campaign. `template.mjml`
  is the body, `config.yaml` is the metadata (subject, segment, etc.).
  Phase 2 deploys this as a **draft** in Klaviyo; Tom reviews and sends
  from Klaviyo's UI.
- **flows/** — one YAML file per managed flow (post-purchase,
  win-back-90d, m4-cross-sell, etc.). Phase 4 compiles the YAML to
  Klaviyo's flow JSON and deploys.

## UTM convention (auto-injected)

The Phase 1 helper `injectUtms` in `src/lib/klaviyo/templates.ts`
rewrites every `https://fitwellbuckle.co/*` link in the compiled HTML to
carry:

| Param | Value |
|-------|-------|
| `utm_source` | `klaviyo` |
| `utm_medium` | `email` (or `sms` when SMS lands) |
| `utm_campaign` | the campaign slug or flow name |
| `utm_content` | the step id (e.g. `03-outfit-your-collection`) |

Rules:

- Only `fitwellbuckle.co` (and subdomains) are rewritten — external links
  pass through untouched.
- URLs that already have `utm_source` are left alone. Override by hand
  in the MJML if you need a non-default tag.
- Existing query params are preserved (e.g. `?variant=42` stays).
- Klaviyo's own merge tags (`{{ unsubscribe_link }}`, `{% web_view %}`)
  aren't absolute URLs so they pass through.

## Local rendering (Phase 1)

There's no template-deploy command yet (that's Phase 2). To eyeball a
template locally:

```ts
import { readFileSync } from "node:fs";
import { compileMjml, injectUtms } from "@/lib/klaviyo/templates";

const src = readFileSync("klaviyo/templates/<slug>/template.mjml", "utf8");
const { html, warnings } = await compileMjml(src);
const finalHtml = injectUtms(html, { campaign: "test", content: "preview" });
console.log(warnings); // empty if all good
// open `finalHtml` in a browser or paste into a litmus / email-on-acid test
```

A `scripts/klaviyo-preview-template.ts` helper that writes the
compiled HTML to `/tmp` and prints the path is a likely Phase 1.5
addition once we have a real template to test against.

## Safety guard (Phase 4)

The flow deploy script (Phase 4) will read `src/lib/klaviyo/managed-flows.ts`
— a hard-coded allowlist of flow names this code is allowed to
touch. The welcome flow is **not** on the list and cannot be modified
via this pipeline. Belt-and-suspenders: the deploy script also refuses
to deploy any flow whose Klaviyo name matches a hard-coded `WELCOME_FLOW_NAMES`
denylist. See the work plan for the full safety model.

## Where to learn more

- Work plan + phasing: `specs/work-plans/todo/klaviyo-integration.md`
- 360 campaign context (why this exists): `specs/strategy/360-campaign.md` Workstream 5
- Read-side integration: `specs/current/integrations.md` (Klaviyo section)
