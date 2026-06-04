# Editing the live Shopify storefront theme

When you need to change anything in the storefront theme — page templates, section files, snippets, the layout, or custom liquid blocks — **use the Shopify CLI**, not the admin code editor. The CLI workflow:

- Keeps changes reviewable (you can grep, diff, and version-control the pull if you want)
- Lets an agent make edits without screen-share or paste-shuffling
- Is reproducible: the same `shopify theme pull` always brings you the live state

The admin code editor is fine for one-line emergency fixes. For anything multi-file or non-trivial, pull.

## Prerequisites

```bash
# Install if missing
npm i -g @shopify/cli @shopify/theme
# or
brew install shopify-cli
```

First `shopify` invocation opens a browser to authenticate against `fitwell-buckles.myshopify.com`. After that the auth persists.

## Pull → edit → push

```bash
# 1. Pull the live theme to a scratch dir
mkdir -p /tmp/fitwell-theme && cd /tmp/fitwell-theme
shopify theme pull --store fitwell-buckles.myshopify.com --live

# 2. Edit files locally (templates/, sections/, snippets/, layout/, etc.)

# 3. Push the edits back. --allow-live is required (live theme is destructive),
#    --nodelete prevents local deletions from being mirrored, --only narrows the
#    upload to specific files.
shopify theme push --store fitwell-buckles.myshopify.com --live \
  --allow-live --nodelete \
  --only "templates/page.landing-page-m1-meta-ads.json"
```

If you omit `--only`, every file in the directory is pushed. That's usually fine after a fresh pull, but `--only` is safer when you've edited a handful of files and the rest of the directory is stale.

## Verifying a push landed

The storefront CDN caches rendered HTML for a few minutes after a push. A `curl` immediately after the push may still serve the old HTML. To confirm the theme actually has your edits:

```bash
# Re-pull (with --only) and grep for the change you made
mkdir -p /tmp/verify && cd /tmp/verify
shopify theme pull --store fitwell-buckles.myshopify.com --live \
  --only "templates/page.landing-page-m1-meta-ads.json"
grep -o 'data-section="hero"' templates/page.landing-page-m1-meta-ads.json
```

A non-empty match confirms the theme has the edit. The CDN-served HTML will catch up within ~5–15 minutes.

## Page templates are JSONC

Files in `templates/*.json` start with a leading `/* … */` block comment that says "auto-generated, do not edit." Despite the comment, **editing them is the normal way to change page composition** — Shopify's admin theme editor writes the same files. The warning is about manual hand-edits clashing with admin-editor changes; CLI edits don't clash, they just have to coexist with whatever the admin editor writes next.

Standard `json.loads` chokes on the leading comment. To parse/modify safely:

```python
import json, re, pathlib
LEADING_COMMENT = re.compile(r"^/\*[\s\S]*?\*/\s*")
raw = pathlib.Path(path).read_text()
data = json.loads(LEADING_COMMENT.sub("", raw))
# … modify data …
out = re.match(r"^/\*[\s\S]*?\*/\s*", raw).group(0) + json.dumps(data, indent=2, ensure_ascii=False)
pathlib.Path(path).write_text(out)
```

(Preserving the comment header is courteous but not required — Shopify will re-add it on next admin-editor save.)

## Finding the right template for a page

A page in `Online Store → Pages` has a `template_suffix` that determines which `templates/page.<suffix>.json` file renders it. If `template_suffix` is empty, the page uses `templates/page.json` (the default).

To inspect from the command line:

```bash
curl -sS "https://www.fitwellbuckle.co/pages/<handle>.json" \
  | python3 -c "import json,sys; p=json.load(sys.stdin)['page']; print('suffix:', p.get('template_suffix'))"
```

If `suffix: None` but the rendered page clearly has custom HTML (e.g., `fw-tabletop` markup), grep the templates dir:

```bash
grep -l "<unique-class-or-text>" /tmp/fitwell-theme/templates/*.json
```

Page templates often have multiple `custom_liquid_*` blocks; usually one is `"disabled": true` (the previous version) and one is active. Make sure you edit the active one.

## Custom liquid blocks inside page templates

Most page-level HTML lives at:

```
templates/page.<suffix>.json
  → "sections"
    → "<section_id>"  (e.g. "custom_liquid_agiUBJ")
      → "type": "custom-liquid"
      → "disabled": <bool>          # skip these
      → "settings"
        → "custom_liquid": "<escaped HTML string>"
```

The `custom_liquid` value is JSON-escaped HTML (literal `\"` and `\n`). When you `json.loads(...)`, those become real characters; when you re-serialize with `json.dumps`, they go back to escaped form. Substitute on the parsed string, not the raw JSON, so quoting stays clean.

## Theme app proxy / app embeds

The storefront PostHog snippet currently lives directly in `theme.liquid` (pasted from `shopify/theme-posthog-snippet.html`). That's fine for now — see `specs/current/posthog-instrumentation.md` for the architecture and the recipe for adding new measurement.

A future move to a theme app embed (so the snippet ships with the Fitwell app rather than being pasted into theme.liquid) would mean the storefront snippet lives in `extensions/` and deploys via `shopify app deploy`. That's out of scope until we have a reason to do it.

## Quick recipe: add `data-section` / `data-cta` to a new landing page

1. Find the template: `curl …/pages/<handle>.json | jq .page.template_suffix`
2. Pull the theme: `shopify theme pull --live`
3. Open `templates/page.<suffix>.json`, find the active `custom_liquid` block (not `disabled`)
4. Edit the embedded HTML string to add:
   - `data-section="<id>"` on wrapping elements — allowed ids in `specs/strategy/event-taxonomy.md` ("Custom engagement" registry)
   - `data-cta="<unique_id>"` on primary CTA anchors/buttons — snake_case, page-scoped
5. `shopify theme push --live --allow-live --nodelete --only "templates/page.<suffix>.json"`
6. Verify with the re-pull/grep recipe above
7. PostHog events `section_scrolled_into_view`, `section_dwelled`, `cta_clicked` start firing within minutes once the CDN refreshes. No theme JS needed — the storefront snippet's IntersectionObserver + click delegation handle everything.

For the full PostHog-side context (which events exist, what dashboards consume them), see `specs/current/posthog-instrumentation.md` and `specs/strategy/event-taxonomy.md`.
