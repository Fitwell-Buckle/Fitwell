# Routes

Last updated: 2026-06-01

## (marketing) — Public Pages

| Path | Description | Auth |
|------|-------------|------|
| `/` | Homepage — hero, value props, social proof | None |
| `/micro-adjust` | Product education — how micro-adjust works | None |
| `/compare/[slug]` | Comparison pages (e.g. `/compare/deployant-vs-micro-adjust`) | None |
| `/for-brands` | B2B landing page for watch brand partnerships | None |
| `/privacy` | Privacy policy | None |
| `/terms` | Terms of service | None |

All marketing pages include PostHog tracking and UTM parameter capture.

## auth

| Path | Description | Auth |
|------|-------------|------|
| `/auth/login` | Admin login page (Google OAuth) | None |
| `/external/login` | External user login — suppliers + B2B portal (email magic link); `/supplier/login` permanently redirects here | None |
| `/portal/login` | Company B2B portal login (email magic link) | None |

## (admin) — Protected Dashboard

All routes require authenticated admin session. Middleware redirects to `/auth/login` if unauthenticated.

| Path | Description |
|------|-------------|
| `/dashboard` | Overview — revenue, orders, traffic KPIs |
| `/leads` | CRM lead list ("B2B Leads") — name/company/stage/source/captured, filters (stage, source, status, search). Tabbed with Messages to Send (SectionTabs) |
| `/leads/new` | Manual lead entry form |
| `/leads/capture` | Mobile-first 3-mode capture: photo (Claude vision OCR), live QR (vCard / MeCard / URL → fields), or type manually |
| `/leads/[id]` | Lead detail — editable fields with stage/persona/source pickers, "Convert to Company" (sets `companyId` + `status='converted'`; does **not** materialize a Shopify `customer` row), drop (soft-delete), card image gallery + raw OCR text. History tab adds comments + shows them with drafted/sent emails; Replies tab shows the contact's emails across all team inboxes |
| `/messages` | "Messages to Send" tab (under B2B Leads) — queue of AI-drafted follow-up emails. Edit subject/body, copy, mark sent, or dismiss |
| `/customers` | "Customers" → **Consumer** tab: consumer list with search/filter/sort. Tabbed with B2B (SectionTabs) |
| `/customers/[id]` | Individual customer detail — orders, LTV, attribution |
| `/customers/brands` | "Customers" → **B2B** tab: B2B companies + price tiers (CRUD) |
| `/customers/companies` | Redirect → `/customers/brands` |
| `/invoices` | "Orders" → **B2B** tab: B2B invoice list. Tabbed with Consumer (SectionTabs) |
| `/invoices/new` | Create an invoice (company + line items at retail − tier) |
| `/invoices/[id]` | Invoice detail — status, send, create-PO actions |
| `/invoices/[id]/edit` | Edit a draft/sent invoice (company is fixed) |
| `/invoices/[id]/print` | Printable invoice document (pay link + bank-wire remittance) |
| `/orders` | "Orders" → **Consumer** tab: consumer order list with filters. Tabbed with B2B (SectionTabs) |
| `/campaigns` | Campaign list — performance overview |
| `/campaigns/[id]` | Campaign detail — spend, conversions, ROAS |
| `/attribution` | UTM attribution analysis |
| `/funnel` | Funnel visualization (sessions → users → orders, operational end-state view) |
| `/funnel/strategy` | Strategic / diagnostic funnel — 6-stage acquisition, 5-stage retention loop, channel breakdown, first-order discount split (360 W5 §6 C1 measurement; classification in `src/lib/discount-codes.ts`). Aligned with `specs/strategy/funnel.md`, `retention-loop.md`, `personas.md`. |
| `/influencers` | Influencer list (CRUD) — handle/platform, assigned collections, portal-login allowlist |
| `/influencer-tracking` | Gifting orders + content-deadline tracking (approaching / missed / hit); inline-edit deadline, mark published, affiliate link |
| `/influencer-tracking/new` | Create a gifting order (100% off draft order; product picker limited to the influencer's assigned collections; content due date + affiliate link) |
| `/products` | Product performance breakdown (+ incoming production qty per SKU) |
| `/inventory` | Incoming inventory — per-SKU units in production, stage breakdown, projected ETA |
| `/modules` | Modules hub (Production; Marketing coming soon) |
| `/modules/production` | "POs & Production" — unified PO list + production tracking. Group toggle: Master (one row per master PO, cascades to sub-POs and SKUs) / Sub-PO (one row per sub-PO, cascades to SKUs) / SKU. View toggle: Incoming Inventory (default) / Production Board (kanban) / Production Timeline (Gantt). Instant filters: supplier, status, stage, size, colour, date range. Absorbed the standalone Purchase Orders and Production Summary pages |
| `/modules/production/po/new` | Create a PO with line items (inline "Add new" for supplier + B2B customer; the customer contact email searches synced Shopify customers and links the matched customer) |
| `/modules/production/po/[id]` | PO detail — stage advance, status, stage timeline, and a unified notes & documents timeline (notes + uploads in one feed; posting notifies the supplier by email + supplier-portal notification) |
| `/modules/production/po/[id]/edit` | Edit PO header + line items (add/update/remove) |
| `/modules/production/po/[id]/send` | Printable PO preview; email it (HTML) to the supplier. The sending admin is auto-CC'd, and every `supplier_contact` row for the PO's supplier (other than the address in "To") is also auto-CC'd so the whole vendor team gets the PO — the list is surfaced in the form before send |
| `/modules/production/kanban` | Kanban board — drag line items across stage columns |
| `/modules/production/suppliers` | Supplier CRUD |
| `/settings` | Admin settings (nav bottom) — env/DB info **plus** the consolidated config: wire-transfer/billing details (moved from Orders), production-stage editor (moved from POs & Production), and B2B **price tiers** (moved from the B2B Customers page). Brands still pick a tier on the B2B customer form |

## supplier — Supplier Portal

Magic-link auth; middleware requires an authenticated session with `role='supplier'` (else → `/external/login`). Signed-in admins are redirected to `/dashboard`; suppliers who hit admin routes are sent here. Every page is scoped to the signed-in supplier's `supplier_id` and shows production fields only (no company / customer / price-tier).

| Path | Description |
|------|-------------|
| `/supplier` | The supplier's own POs (list) |
| `/supplier/po/[id]` | PO detail — advance stages, edit the expected delivery date, and a unified notes & documents timeline (post notes + edit your own, upload documents; no edit/delete of stage-history events); 404 if not their PO. Posting a note/doc emails Fitwell + adds an admin notification. **ETA + timeline target**: on a standalone PO, both target that PO's own row. On a master (multi-supplier split), the page surfaces the *viewing supplier's* sub-PO — the ETA edits the sub-PO's date, and the supplier's posts target the sub-PO too (their private thread). The displayed timeline merges the **master's thread** (admin broadcasts to every supplier) with the supplier's own sub-PO thread, so a single master upload reaches every sub-PO supplier without duplication. A stage-only viewer on a master with no sub-PO of their own stays read-only on ETA and sees the master's thread |
| `/supplier/po/[id]/print` | Printable PO document for the supplier — the same artifact admins print/email from `/modules/production/po/[id]/send` (shared `PrintablePo` component), scoped to the viewing supplier's sub-PO (their stages, their per-line costs). Reached via the "Print / Save PDF" button on the PO detail page; `window.print()` → browser save-as-PDF. 404 if not their PO; a stage-only viewer on a master with no sub-PO of their own can't print it (would leak other suppliers' costs) |
| `/supplier/notifications` | Supplier notification inbox — notes & documents Fitwell posted on the supplier's POs (mark read; same system as the admin inbox). Unread count shows as a bell badge in the top bar |

## portal — Company B2B Portal

Magic-link auth; middleware requires `role='company'` (else → `/portal/login`). Companies are kept out of admin/supplier areas, and admins/suppliers out of the portal. Scoped to the signed-in user's `company_id`; prices reflect the company's price tier.

| Path | Description |
|------|-------------|
| `/portal` | Browse the catalog at the company's tier price; build a cart and check out |
| `/portal/orders` | The company's own order history (paid/sent invoices) with Shopify pay links |

## API Routes

### Auth
| Method | Path | Description |
|--------|------|-------------|
| * | `/api/auth/[...nextauth]` | NextAuth handler (login, callback, session) |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | App health check |

### Admin API (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/customers` | List customers (paginated, filterable) |
| GET | `/api/admin/customers/[id]` | Customer detail |
| GET | `/api/admin/orders` | List orders (paginated, filterable) |
| GET | `/api/admin/funnel` | Funnel data (date range) |
| GET | `/api/admin/cohort` | Cohort analysis data |
| GET | `/api/admin/attribution` | Attribution breakdown |
| GET | `/api/admin/campaigns` | Campaign performance list |
| GET | `/api/admin/campaigns/[id]` | Campaign detail with daily metrics |

### Production API (each handler checks `auth()`)

Supplier scoping: when the session `role='supplier'`, write endpoints are restricted to the supplier's own POs — `advance`, `comments` (add + author-only edit), `attachments` (upload), and `line-items/[id]/stage` are owner-checked (403 otherwise); PO edit (`PATCH`/`PUT po/[id]`), receive, stage-event date edits, attachment delete, and supplier-contact management are admin-only (403 for suppliers). Admins are unaffected.

Cross-party notifications: **every PO write** fires an in-app notification + email to the other side via `notifyPoUpdate` (the supplier-bound type is `update_for_supplier`; admin-bound is `update_for_admin`). Notes and document uploads keep their existing `notifyPoActivity` alerts; the `send` flow already emails the supplier directly so it isn't double-notified. Stage advances also keep their existing `stage_handoff` milestone alert for the supplier-completes case — the generic update lives alongside it so the recipient still sees every move.
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/production/shopify-refs` | Warehouses (Shopify locations) for the PO picker; needs `read_locations` |
| GET | `/api/production/customer-search` | Typeahead over synced customers (name/email) for linking a company |
| POST | `/api/production/companies` | Create a company. If a `contactEmail` is given, auto-attaches a matching **unlinked** lead (preferred) or Shopify customer as the company's primary contact (`lib/b2b/attach-contact.ts`) — so "turning a lead into a company" keeps the person attached |
| PATCH | `/api/production/companies/[id]` | Update a company |
| POST | `/api/production/companies/[id]/contacts` | Add a B2B portal login email to a company (Phase 7 allowlist); admin-only |
| POST | `/api/production/companies/[id]/people` | Attach/detach a person or set Primary Contact — JSON `{ kind: "lead"\|"customer", entityId, action: "add"\|"remove"\|"make_primary" }`. add/remove set/clear their `company_id` (remove also clears the company's primary pointer if it was them); make_primary points `company.primary_contact_*` at them. Powers the company "People" list |
| GET | `/api/crm/people-search?q=` | Typeahead over leads + Shopify customers (name/email/company) to attach to a company; returns `{ kind, id, label, sublabel, companyId }[]` |
| DELETE | `/api/production/company-contacts/[id]` | Remove a company portal login email; admin-only |
| POST | `/api/production/price-tiers` | Create a price tier (% off retail) |
| PATCH | `/api/production/price-tiers/[id]` | Update a price tier |
| GET | `/api/production/collections` | Shopify catalog grouped by collection (+ Uncategorized). Primary source for the chooser's collection selector — `useCatalog` prefers this (and dedupes variants), falling back to the flat endpoint below |
| GET | `/api/production/products` | Flattened active Shopify catalog (variants + `priceCents` + derived `sizeMm`/`color`). Source for the shared searchable product chooser (`ProductCombobox` / `useCatalog`, with size/colour quick-filters) used by the PO form, invoice form, and future inventory page. Server components use the cached `getCatalogCached` (e.g. the POs page size/colour filter) |
| POST | `/api/production/po` | Create a PO + line items (PO number auto-assigned from a sequence, "00100"+) |
| PATCH | `/api/production/po/[id]` | Update PO fields (status, lock, dates, notes) |
| PUT | `/api/production/po/[id]` | Full edit — header + reconcile line items (add/update/remove) |
| POST | `/api/production/po/[id]/advance` | Advance stage — whole PO (locked) or one line item |
| POST | `/api/production/po/[id]/sub-advance` | Advance a **sub-PO**: `{mode}` — `step` (forward within the supplier's stages) or `complete` (hand off to the next supplier). Admin or the owning supplier |
| PUT | `/api/production/po/[id]/line-costs` | Set a sub-PO supplier's per-line unit costs `{costs:[{lineItemId,unitCostCents}]}`; rolled up onto the master by (supplier, line); admin-only |
| POST | `/api/production/po/[id]/receive` | Receive into Shopify (C2) — `inventoryAdjustQuantities` +qty per line item, with the PO number stamped on the adjustment reference; idempotent per line; admin-only; needs `write_inventory` |
| POST | `/api/production/po/[id]/invoice` | Create invoice(s) from a PO — one per bill-to company, priced at Shopify retail − tier; admin-only |
| POST | `/api/production/po/[id]/comments` | Add a note to a PO. Notifies the other party — an internal note emails the supplier + adds a supplier-portal notification; a supplier note emails Fitwell + adds an admin notification |
| PATCH | `/api/production/po/[id]/comments/[commentId]` | Edit a note's body (`{ body }`, 1–5000 chars). **Author-only** — the update is scoped to `(commentId AND author_user_id = you)` in the WHERE clause, so editing anyone else's note matches no row → 403. Stamps `updated_at` (surfaces "(edited)"). Same PO-scope gate as POST (suppliers limited to their own POs). No notification fired on edit |
| POST | `/api/production/po/[id]/attachments` | Upload a document to a PO (Vercel Blob; multipart). Notifies the other party (same routing as notes) |
| DELETE | `/api/production/attachments/[id]` | Delete an attachment (blob + row) |
| DELETE | `/api/production/po/[id]` | Hard-delete a PO and its dependents (line items, stage events, costs, attachments, comments, sub-POs) via schema FK cascade; admin-only. Confirmation required in UI. Linked Shopify drafts / invoices are NOT auto-revoked |
| POST | `/api/production/line-items/[id]/stage` | Set a line item's stage (kanban drag); locked POs move together |
| GET | `/api/production/stages` | List the active production stages (key + label + position) for the editor |
| PUT | `/api/production/stages` | Replace the pipeline — rename/add/delete/reorder stages. Deleting a stage with items in it requires a `{moves:{key:"forward"\|"back"}}` direction; it soft-deletes (history kept) and moves stranded line items. Admin-only. Drives the POs & Production "Setup" modal |
| PATCH | `/api/production/stage-events/[id]` | Edit a stage transition date (entered_at, day-granularity); syncs the previous stage's exited_at; chronological bounds; admin-only |
| POST | `/api/production/suppliers` | Create a supplier |
| PATCH | `/api/production/suppliers/[id]` | Update a supplier |
| POST | `/api/production/suppliers/[id]/contacts` | Add an authorized login email to a supplier |
| DELETE | `/api/production/supplier-contacts/[id]` | Remove a supplier login email |
| GET / POST | `/api/notifications` | Admin notification inbox — unread count (GET) + mark read (POST `{id}` or `{all}`); admin-only (suppliers/companies 403). Excludes supplier-bound rows |
| GET / POST | `/api/supplier/notifications` | Supplier notification inbox — unread count (GET) + mark read (POST `{id}`/`{all}`); scoped to the signed-in supplier |
| PUT | `/api/supplier/po/[id]/eta` | Update the PO's expected delivery date `{expectedDeliveryDate: "YYYY-MM-DD" \| null}`; allowed for the PO's primary supplier OR any supplier assigned to one of its stages (mirrors the page-level access check; 403 otherwise). Rejects masters with 409 — on a multi-supplier split each sub-PO carries its own date |
| PUT | `/api/production/po/[id]/stage-eta` | Upsert a target end date for one stage on this (sub-)PO: `{stage, targetEndDate: "YYYY-MM-DD" \| null}` (null clears). Admin-only; the production timeline's inline editor calls this. Overrides the cycle-time projection on the chart when set |
| PUT | `/api/supplier/po/[id]/stage-eta` | Supplier twin of the stage-eta route: same body, same writes via `setPoStageEta`. Allowed for the PO's primary supplier OR any supplier assigned to one of its stages (mirrors the eta-route access check) |

### Invoicing API (B2B; each handler checks `auth()`; admin-only — suppliers 403)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/invoices` | Create an invoice (company tier discount snapshotted; accepts optional `depositPercent` override) |
| PATCH | `/api/invoices/[id]` | Change status (draft → sent → paid / void) |
| PUT | `/api/invoices/[id]` | Full edit — header + line items (blocked once paid/void); accepts optional `depositPercent` override that beats the brand default at send |
| DELETE | `/api/invoices/[id]` | Hard-delete the invoice + line items + attachments via FK cascade; admin-only; confirmation required in UI. Any linked Shopify draft order (deposit or balance) is NOT auto-revoked |
| POST | `/api/invoices/[id]/send` | Email the invoice (Resend) + push a Shopify draft order with a payment link when the company is linked to a Shopify customer (`write_draft_orders`); marks "sent". **Blocks the send** if the payment link can't be created — 409 for missing scope, 502 for any other Shopify failure — so a linkless invoice never goes out to a Shopify-linked brand |
| POST | `/api/invoices/[id]/create-po` | Create a draft production PO from the invoice (pick supplier) |
| POST | `/api/invoices/[id]/fulfill` | Mark the invoice fulfilled; if a deposit was taken, also creates the second "balance" Shopify draft order for the remainder and stores `shopify_balance_draft_order_id` / `shopify_balance_invoice_url` |
| POST | `/api/invoices/[id]/deposit-paid` | Granular: stamp `deposit_paid_at` (separate from the overall status flip) |
| POST | `/api/invoices/[id]/balance-paid` | Granular: stamp `balance_paid_at` (separate from the overall status flip) |
| POST | `/api/invoices/[id]/attachments` | Upload a customer document to an invoice (e.g. their PDF PO) — Vercel Blob, multipart. Returns a graceful 503 when `BLOB_READ_WRITE_TOKEN` isn't set |
| DELETE | `/api/invoices/attachments/[id]` | Remove an invoice attachment (best-effort blob delete + always-on DB row delete) |
| PATCH | `/api/settings/billing` | Update remittance / bank-wire details shown on invoices |
| PATCH | `/api/settings/lead-followups` | Update the two follow-up rules — `initialDraftEnabled` (auto-draft on new-lead capture) + `enabled`/`nudgeAfterDays` (unanswered-email follow-up); persisted in `lead_followup_settings` |

### CRM API (each handler checks `auth()`; admin-only — suppliers/companies 403)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leads` | List leads with optional filters (stage, sourceChannel, ownerUserId, status, search). Defaults to `status='active'`; search is case-insensitive across first/last name, email, and company name. Sorted by `capturedAt desc` |
| POST | `/api/leads` | Create a lead. Requires at least one of name/email/phone/company. **Duplicate guard**: if an active lead with the same email exists, returns 409 `{ error, existingLeadId }` unless `allowDuplicate:true` is sent. Stage defaults to `'prospect'`; owner defaults to the capturing user |
| GET | `/api/leads/[id]` | Lead detail |
| PATCH | `/api/leads/[id]` | Partial update (any subset of fields). "Convert to Company" is a PATCH that sets `companyId` and `status='converted'` |
| DELETE | `/api/leads/[id]` | Default: soft-delete (`status='dropped'`, row preserved). `?hard=1`: **permanent** delete — removes the lead and cascades its card images + outbound messages (used to clean up duplicates) |
| POST | `/api/leads/scan-card` | Upload a business-card image (multipart, 10 MB cap, JPEG/PNG/GIF/WebP); puts to Vercel Blob then calls Claude Sonnet 4.5 vision via a forced tool_use with a strict JSON schema. Returns extracted fields + confidence per field + raw read text + the Blob URL. Does **not** persist a lead — the client follows up with POST `/api/leads`. 503 if `BLOB_READ_WRITE_TOKEN` or `ANTHROPIC_API_KEY` is unset |
| POST | `/api/leads/[id]/cards` | Attach a business-card image (already uploaded to Blob) to an existing lead — JSON body `{ blobUrl }`. Records it in `lead_card_image` and bumps `lead.card_image_url`. Used by the capture dedup flow's "attach to existing lead" action |
| GET | `/api/leads/match?email=` | Given an email, returns `{ matchedCompany, matchedLead, matchedDomain }` — matches the email's (non-free) domain to a company and finds an active same-email lead. Drives the capture-confirm dedup banners |
| POST | `/api/leads/[id]/draft-followup` | Draft a follow-up email from the lead's notes/context via Claude Sonnet 4.5 and queue it in `outbound_message` (status `draft`). `?auto=1` (the fire-and-forget on-capture call) respects the `initial_draft_enabled` setting and no-ops when off; the manual "Draft follow-up" button omits it and always drafts. 503 if `ANTHROPIC_API_KEY` unset |
| POST | `/api/leads/[id]/sync-address` | Push the lead's business-card address to Shopify as an **additional** address on the customer matched by the lead's email (never overwrites, never default; de-duped in `client.createCustomerAddress`). 409 when the lead has no email / no matching Shopify customer; 400 with no card address; 502 if the `write_customers` scope isn't granted yet. Shopify stays source of truth — the address flows back on the next customer sync |
| GET / POST | `/api/leads/[id]/comments` | GET lists the lead's manual timeline comments (newest first, author resolved); POST adds one — JSON `{ body }` (1–5000 chars). Comments appear in the lead's History tab. Admin-only |
| GET | `/api/leads/[id]/replies` | The contact's message history across both channels. Email: searched live across **all Gmail-scoped team inboxes** (not just the owner's), each tagged with the inbox + `threadId`/`mailboxEmail` for a Gmail deep-link. WhatsApp: rows matched to the lead id (`channel:"whatsapp"`, no inbox/thread). `?direction=sent` returns what WE sent; otherwise inbound. Each row carries `channel` (`email`/`whatsapp`). Returns `{ replies, mailboxes }` (mailboxes = email inboxes searched) |
| GET | `/api/messages` | List queued outbound messages (joined with lead name). Defaults to `status='draft'`; `?status=sent\|dismissed` for the others |
| PATCH | `/api/messages/[id]` | Edit a queued message (subject/body/toEmail/`cc`/`bcc`) or change status. `cc`/`bcc` are comma-separated email lists (validated; `""` clears). `scheduled` + `scheduledAt` (ISO) queues an auto-send (records the actor as `created_by_user_id`); `sent` stamps `sent_at`; leaving `scheduled` clears `scheduled_at`; `dismissed` removes it from the queue |
| POST | `/api/messages/[id]/send` | Send the message through the signed-in admin's Gmail (From = their account) then mark it sent. Embeds an invisible open-tracking pixel (multipart text+HTML). Needs the `gmail.send` scope — 409 with a re-sign-in prompt if not yet authorized |
| POST | `/api/messages/[id]/rewrite` | AI-rewrite the on-screen draft — JSON `{ subject, body, instruction? }`. Returns `{ subject, body }` for the editor to apply (never persists; the editor saves via PATCH). 503 if `ANTHROPIC_API_KEY` is unset |
| POST | `/api/leads/[id]/replies/dismiss` | Hide one inbound reply from the lead's Replies tab — JSON `{ gmailMessageId }`, appended to `lead.dismissed_reply_ids` |
| GET | `/api/customer-messages/count` | `{ b2b, consumer, supplier, influencer, total }` of undismissed messages (nav dots) |
| GET | `/api/inbound?emails=a,b` | A contact's message history across both channels. Email: one or more addresses (comma-separated), searched across all connected team inboxes, merged + deduped by gmail id. **Only messages FROM the external contact** — internal senders filtered out (`lib/crm/internal-email.ts`). WhatsApp: pass `waType=customer\|supplier` + `waId` to merge phone-matched WhatsApp rows. `?direction=sent` returns what WE sent. Each row carries `channel`. Returns `{ replies, mailboxes }`. Powers the per-customer / per-supplier **Messages** view |
| POST | `/api/customer-messages/[id]/dismiss` | Mark a customer message dismissed (`dismissed_at = now`) |
| POST | `/api/compose/draft` | AI-draft a reply to an inbound email — JSON `{ contactName?, theirSubject?, theirMessage?, threadId?, relationship? }` → `{ subject, body }`. When `threadId` is given, the full prior Gmail thread (your token) is read and fed to the prompt so the draft is grounded in the real back-and-forth. 503 if `ANTHROPIC_API_KEY` unset |
| POST | `/api/compose/send` | Send a composed reply from the signed-in admin's Gmail — JSON `{ to, subject, body, cc?, bcc?, threadId?, inReplyTo? }` (`cc`/`bcc` comma-separated email lists, validated). Embeds an open-tracking pixel and logs the send as a `sent` outbound_message so opens are tracked. Same `gmail.send`/API-enabled 409s as the messages send route |
| GET | `/api/track/open/[token].gif` | **Public, no auth.** Open-tracking pixel — returns a 1×1 transparent GIF and records the open (`open_count`++, `first/last_opened_at`) on the matching `outbound_message`. `.gif` suffix is stripped. Best-effort: always returns the image; no-cache headers. Opens are approximate (proxy pre-load / image-blocking) |

### Influencer API (each handler checks `auth()`; admin-only — suppliers/companies 403)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/influencers` | Create an influencer |
| PATCH | `/api/influencers/[id]` | Update an influencer (incl. assigned collections) |
| POST | `/api/influencers/[id]/contacts` | Add an influencer portal-login email (future portal allowlist) |
| DELETE | `/api/influencer-contacts/[id]` | Remove an influencer portal-login email |
| POST | `/api/influencer-orders` | Create a gifting order — push a Shopify draft order at 100% off (`write_draft_orders`), record content due date + affiliate link; still records as `draft` (with a warning) if the Shopify push fails |
| PATCH | `/api/influencer-orders/[id]` | Edit content deadline / published date / affiliate link / status |
| DELETE | `/api/influencer-orders/[id]` | Hard-delete a gifting order + line items via FK cascade; admin-only; per-row icon button on the tracking table. Shopify gifting draft order is NOT auto-revoked |

### Gmail API (admin-only)

Uses the signed-in admin's stored Google OAuth access token (DrizzleAdapter's `account` row, `provider='google'`). Auto-refreshes via `refresh_token` when expired and writes the new token back. Requires the `gmail.readonly` scope on the admin's account — granted by the Google provider config in `lib/auth.ts` (`access_type: offline`, `prompt: consent`). Existing admins must sign out + back in once after the scope was added to pick it up; the `signIn` callback then force-writes the fresh tokens (NextAuth's `DrizzleAdapter` won't refresh them on re-sign-in by default).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gmail/search?q=…` | Search the admin's mailbox for messages matching `q`, parse From/To/Cc headers, return distinct email addresses + names + most-recent-message snippet. Returns a friendly `error` string when the token's missing / scope isn't granted / Gmail API isn't enabled (caller renders inline, not as a 500) |

### Portal API (B2B; company-scoped via `role='company'`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/portal/checkout` | Instant self-checkout: create a Shopify draft order at the company's tier discount + record the order as an invoice; returns the Shopify pay link. Needs `write_draft_orders` |

### Cron Jobs (Vercel Cron, protected by `CRON_SECRET`)
| Method | Path | Schedule | Description |
|--------|------|----------|-------------|
| GET | `/api/cron/extract-shopify` | `15 */2 * * *` | Sync orders + customers from Shopify |
| GET | `/api/cron/extract-ga4` | `30 6 * * *` | Daily GA4 traffic data |
| GET | `/api/cron/extract-google-ads` | `45 6 * * *` | Daily Google Ads spend/conversions |
| GET | `/api/cron/extract-gsc` | `0 7 * * *` | Daily Search Console data |
| GET | `/api/cron/extract-posthog` | `0 */3 * * *` | PostHog event aggregation |
| GET | `/api/cron/production-deadline-alerts` | `0 13 * * *` | Email owner + suppliers about line items due soon / overdue, and complete POs ready to receive |
| GET | `/api/cron/sent-followups` | `0 14 * * *` | Scan connected Gmail Sent folders, match recipients to leads/customers/suppliers (`sent_email`), and for any sent ≥N days ago with no reply draft a **threaded** follow-up into Next Steps (replies in the original thread). N + on/off in Settings → Lead follow-ups. Replaced `lead-followups`. `?regenerate=1` skips scanning and re-drafts the follow-ups already queued in Next Steps with the current prompt (overwrites bodies in place) — used after a prompt change |
| GET | `/api/cron/send-scheduled` | `*/15 * * * *` | Send queued messages whose `scheduled_at` has passed, via the scheduler's Gmail (`outbound_message.created_by_user_id`), then mark them sent. Messages with no sender/recipient are skipped (stay scheduled) |
| GET | `/api/cron/lead-replies` | `*/5 * * * *` | Detect new lead replies (owner Gmail, bounded-concurrency) and raise an admin notification ("X replied"); de-duped via `lead.replies_notified_at` |
| GET | `/api/cron/customer-messages` | `*/15 * * * *` | Scan connected team inboxes for recent inbound mail from existing customers, suppliers, **or influencers** (matched by stored email), record new ones in `customer_message` (dedup on gmail id), and raise a `customer_message` notification per match |
| GET | `/api/cron/health` | `0 */4 * * *` | Infrastructure health check |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/shopify` | Shopify webhook receiver (orders/create, orders/updated, customers/update) |
| GET / POST | `/api/webhooks/whatsapp` | WhatsApp (Meta Cloud API). GET = verification handshake (`hub.challenge` when `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`). POST = inbound messages: verifies `X-Hub-Signature-256` HMAC (when `WHATSAPP_APP_SECRET` set), matches each sender's phone to a lead/customer, records a `whatsapp_message`, and raises a notification. Inert until the Meta app + number + webhook are configured |

## Open Questions

- [ ] Do we need `/api/admin/products` or is product data always derived from order line items?
- [ ] Webhook endpoint for additional Shopify topics (products/update, refunds/create)?
- [ ] Public API for partner integrations, or strictly internal?
