# Creator Outreach — Wave 1 Runbook (Phase 0)

Status: **ready to send** (created 2026-07-01). Owner: Tom. Companion to
[[creator-outreach-campaign.md]] Phase 0. Brand guardrails:
`.claude/skills/fitwell-brand`. Voice grounded in [[../../strategy/vocabulary-map.md]].

This is the zero-build runbook: how to tier the wave, what to send, and how to log
it in the portal that already exists. Sending from **tom@fitwellbuckle.co**.

## 1. Tiering (by `crossPlatformFit`, tunable)

`crossPlatformFit` = `max(per-platform fit) + 0.2 × min` (0–120). Size sweet spot
is 10K–100K followers ([[../../strategy/creator-scoring.md]]). Assign each creator a
tier; the tier sets commission, rights ask, and which template to use.

| Tier | Rough band | Commission | Rights ask | Audience offer | Template |
|---|---|---|---|---|---|
| **Anchor** | top ~10% — highest fit, sweet-spot size, strong ER | **20%** | paid_90d → perpetual (negotiated) | 15% code | §3c |
| **Partner** | core — ~10K–100K, solid fit | **15%** | paid_30d | 15% code | §3b |
| **Seed** | long tail — smaller / lower fit but on-topic | **10%** | organic reshare | 15% code | §3a |

Notes:
- The **15% audience code is the same across all tiers** — it matches the standing
  email-signup floor (never deeper). It differentiates on *commission*, not discount.
- Bands are a starting cut. Use `scoreBoost` / judgment to move a creator up a tier
  (e.g. a perfect-fit 8K creator can be a Partner).
- Rights ask escalates with tier because bigger partners get more value from the
  relationship; don't over-ask a Seed for perpetual paid rights.

## 2. On-brand rules for every message

- **Lead with the fix, not the price.** The between-holes / "make the watch you
  stopped wearing wearable again" outcome is the hook. Full price always; commission
  rewards the creator, never a discount to convert.
- **Set the anchor** — micro-adjust *on a tang/ardiglione buckle* (not a deployant,
  not a $5 OEM buckle). That's the differentiation customers actually perceive
  (review #66).
- **Tell the truth.** "Set once" — the link loosens on-wrist easily but is deliberately
  firm to tighten (positive-effort lock is a *feature*, per Giulio Carena's review).
  It's a **2-position** micro-adjust, not 3. Don't overclaim.
- **Content tip for the creator (put in the brief, not the cold email):** the
  scroll-stopping shot for *their audience* is the on-wrist adjustment motion; the
  story that makes it stick is the fit. Show the motion, tell the fit.
- Confident, precise, founder-honest. Short. No hype, no bargain language.

## 3. Outreach templates

Merge fields: `{{first_name}}`, `{{handle}}`, `{{platform}}`, `{{watch_or_niche}}`.
Keep subject lines plain; these are DMs-or-email from a founder, not a brand blast.

### 3a. Seed — gift-first, low friction

**Subject:** A buckle for you, {{first_name}}?

> Hi {{first_name}} — Tom here, founder of Fitwell Buckle Co. I make a micro-adjust
> watch buckle: it's the fix for a strap that fits between two holes — one hole too
> tight, the next too loose. Set it once and the watch finally sits right.
>
> I've been enjoying your {{watch_or_niche}} posts and I'd love to just send you one,
> no strings — pick a size and it's yours. If it earns a spot on your wrist and you
> feel like sharing it, even better; I'll set you up with a link so anything it drives
> comes back to you as commission. But first I just want you to have one.
>
> Want me to send it? Reply with your size and address and it's on the way.
>
> — Tom

### 3b. Partner — the core partnership pitch

**Subject:** Micro-adjust, on a tang buckle — thought of you, {{first_name}}

> Hi {{first_name}} — I'm Tom, founder of Fitwell Buckle Co. We make the only real
> micro-adjust for watch *straps* (not just bracelets and deployants): a buckle that
> solves the between-holes problem — the fit that falls between one hole too tight and
> the next too loose. You set the micro-adjust once and the watch sits exactly right.
>
> Your {{platform}} audience is exactly the crowd that notices this stuff, and I'd
> love to work with you. Here's the shape of it:
>
> - I send you a buckle (your pick) — yours to keep.
> - You get a **15% code** for your audience and **15% commission** on every sale it
>   drives. I'll show you real numbers — sales, what your posts actually converted —
>   which no platform gives you.
> - If a post performs, I'd love to feature it back to our audience too.
>
> No script, no deadline pressure — post it honestly if it earns it. The on-wrist
> adjustment is the shot that stops the scroll; the reason people keep it is the fit.
>
> Want in? Reply with your size + address and I'll get one out this week.
>
> — Tom

### 3c. Anchor — high-touch, founder-personal

**Subject:** {{first_name}} — a partnership, not a gifting

> Hi {{first_name}} — Tom, founder of Fitwell Buckle Co. I'll keep this direct because
> I think you're one of the few people who'd genuinely get what we've built: the only
> micro-adjust that works on a tang buckle, not just a deployant. It fixes the
> between-holes fit — the watch you set aside because it never sat right, wearable
> again — and it's engineered to lock firm, not creep loose under a heavy head.
>
> I don't want to gift-and-hope with you; I want a real partnership:
>
> - A buckle (or a few — outfit your collection), yours.
> - **20% commission** and a 15% code for your audience, with a live view of exactly
>   what your content drives in sales — the data no platform hands a creator.
> - We run your best content as our own paid creative, credited to you, and feature
>   you to our audience. Growth both directions.
> - Early access to what we're making next, and a real say in it.
>
> If that's interesting, I'd rather jump on a quick call than write specs at you.
> When's good? (And if you just want a buckle to try first — say the word, it ships
> today.)
>
> — Tom

## 4. Logging in the portal (do this as you send)

For each creator contacted, in `/creators/[id]`:
1. Set the **tier** on the creator (once Phase 1 `offerTier` field ships; until then,
   note it in `notes`).
2. Add an **outreach thread** (`outreach-panel`): channel = email, status = no_reply,
   terms = the tier's offer, which auto-logs the first `outreachEvent` and sets a
   follow-up date.
3. When they reply with an address, create the **$0 gifting order** via
   `influencer-tracking/new/` (Phase 3 will prefill this from their email; Phase 4
   lets them self-serve). Set `contentDueDate` if you agreed a timeframe.
4. The action engine (`/creators` follow-ups) surfaces who's due — clear it by
   exception, don't chase manually.

## 5. Cadence

Send in batches you can personally keep warm — realistically **10–20 a day**, not
100 at once, so replies don't pile up faster than you can gift + log. The whole wave
over 2–3 weeks (L1). Quality of the first-reply exchange beats volume; the action
engine keeps the follow-ups from slipping.

## Related
[[creator-outreach-campaign.md]] • [[../../strategy/creator-program.md]] •
[[../../strategy/vocabulary-map.md]] • [[../../strategy/hypotheses.md]] (H14 — on-wrist
hook vs. between-holes retained value) • [[../../strategy/retention-loop.md]] (advocate stage).
