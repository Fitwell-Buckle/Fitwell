# Creator Scoring Methodology

Reference for the formulas behind `watch_score`, `fit_score`, and `cross_platform_fit` in the creator management system.

These scores were developed during the May 2026 research pass that produced `Fitwell_Creators_CrossPlatform.csv` (735 creators). The same formulas should be re-implemented in Phase 1's import script and in the nightly stats refresh cron so scores stay current as platform stats drift.

---

## 1. Watch-relevance keyword score (`watch_score`)

A weighted sum of keyword matches across the creator's bio, channel description, and recent post captions / video titles. The vocabulary is intentionally watch-buckle-relevant (not just "watches" broadly), so brands like Garmin and Apple Watch are included (we make buckles for both traditional and Apple Watch).

### Tier A — distinctive watch vocabulary (weight: 5)

```
horology, horological, watchmaking, watchmaker,
wristshot, wristwatch, microbrand, micro brand, micro-brand,
micro adjust, micro-adjust, deployant, tang buckle, pin buckle (4),
grand seiko, audemars piguet, patek philippe,
submariner (4), speedmaster (4), seamaster (4), datejust (4),
tag heuer (4), breitling (4), longines (4), tissot (4),
iwc (4), jaeger lecoultre, tourbillon
```

### Tier B — solid watch signal, more generic (weight: 1–4)

```
watch (1), watches (1),
dive watch (4), diver watch (4), field watch (4), dress watch (4),
pilot watch (4), gmt watch (4), mechanical watch (4),
automatic watch (4), quartz watch (3),
chronograph (3), gmt (2), movement (1), calibre (3), caliber (2),
rolex (4), seiko (3), tudor (2), omega (2), hamilton (1),
casio (2), g-shock (4), cartier (2),
bezel (2), dial (1), lugs (3), crown guard (3)
```

### Tier C — adjacent / Fitwell-relevant (weight: 1–4)

```
apple watch (3), smartwatch (2), wearable (1), wearables (1),
strap (2), nato strap (4), leather strap (3), rubber strap (3),
buckle (3), watch band (4), edc (2), everyday carry (2),
garmin (2)
```

### Match counting rules

- Whole-word matches only (`\bKW\b`)
- Case-insensitive
- Each keyword's contribution capped at **5 occurrences** (for IG bios) / **8 occurrences** (for caption-heavy text). Prevents one creator who says "watch" 50 times in a single video from dominating.

### False-positive filter for "watch" as a verb

Before counting, strip these patterns:

```regex
\bwatch\s+(this|me|out|as|how|now|today|live|the|him|her|them|us|next|more|my|our|video|along|here|it)\b
\bwatched\b
\bwatching\b
```

This avoids inflating scores for content like "watch this video" or "watching the game."

### Score → confidence buckets

| Score | IG bucket | YT bucket |
|---|---|---|
| ≥60 | high | high (≥40) |
| 25–59 | medium | medium (15–39) |
| 8–24 | low | low (5–14) |
| <8 | none | none |

IG thresholds are higher because IG inputs include bio + 12 post captions (more text → more matches). YT inputs are typically channel description + 20 recent video titles/descriptions (less text per channel).

---

## 2. Engagement rate (`engagement_rate_pct`)

### Instagram

```
ER% = mean( (likesCount + commentsCount) / followersCount ) × 100
```

Computed across the creator's last ~12 posts (whatever Apify/free endpoint returns). Posts older than the configured window (default 60 days) are excluded.

### YouTube

```
ER% = mean( (likeCount + commentCount) / viewCount ) × 100
```

Computed across videos published in the last 90 days.

Also computed but not used in fit_score:
- `views_per_sub` = avg_views / subscribers (popularity index, secondary signal)

---

## 3. Composite `fit_score` (per platform, 0–100)

Combines multiple signals into a single ranking number per platform record. Used to surface highest-priority outreach targets.

### Formula

```
fit_score = relevance × 0.30
          + engagement × 0.25
          + size_fit × 0.15
          + activity × 0.10
          + email_bonus × 0.20
```

### Component definitions

**`relevance`** (0–100): `min(watch_score, 250) / 2.5`
Caps at 100 (watch_score of 250+ = max relevance).

**`engagement`** (0–100): `min(ER% × 20, 100)`
ER of 5% → 100, capped. (5% is excellent; most are 1–4%.)

**`size_fit`** (0–100): Peaks at the 10K–100K band (Fitwell's stated sweet spot).
| Followers | size_fit |
|---|---|
| 10,000 – 100,000 | 100 |
| 5,000 – 9,999 | 80 |
| 100,001 – 250,000 | 80 |
| 250,001 – 500,000 | 65 |
| 500,001 – 1,000,000 | 50 |
| >1,000,000 | 30 |
| 1,000 – 4,999 | 40 |
| <1,000 | 10 |

**`activity`** (0–100): How recent was their last post.
| Days since last post | activity |
|---|---|
| ≤14 | 100 |
| 15–30 | 85 |
| 31–60 | 65 |
| 61–90 | 45 |
| 91–180 | 20 |
| >180 | 5 |
| no posts available | 0 |

**`email_bonus`** (0–100):
- Business-style email (info@, contact@, press@, hello@, etc.): **100**
- Personal email (gmail, icloud, etc.): **70**
- No email: **0**

### Special case: rows without engagement data

For creators we have profile-only data on (Apify base scrape, no posts pulled), engagement and activity can't be computed. Re-normalise pro-rata:

```
fit_score_partial = (relevance × 30 + size_fit × 15 + email_bonus × 20) / 65
```

Drops the 25 + 10 = 35 missing weight and renormalises the remaining components.

---

## 4. Cross-platform fit (`cross_platform_fit`)

When a creator has both IG and YT records, combine their per-platform fit_scores into one number.

```
cross_platform_fit = max(IG_fit, YT_fit) + 0.2 × min(IG_fit, YT_fit)
```

Rationale: take the better platform as the primary signal, then bonus credit for being multi-platform (a creator who's 70 on YT and 60 on IG is more valuable than one who's just 70 on YT — broader reach).

If only one platform: `cross_platform_fit = that platform's fit_score`.

---

## 5. Primary platform determination

For creators on both platforms:

```
primary = "YT" if YT_subscribers >= IG_followers else "IG"
```

Pure follower count, no engagement weighting. Rationale: "primary" is about audience reach, not engagement quality (engagement is already in fit_score).

---

## 6. "Watch keyword in caption" detection (for `creator_post.mentioned_us`)

When auto-detecting posts (Phase 5 of the work plan), a post is flagged as `mentioned_us = true` if any of these appear in caption/title/description (case-insensitive):

```
fitwell, @fitwellbuckle, fitwellbuckle.co, fitwell buckle
```

Add to this list as new brand handles or campaign-specific hashtags emerge.

---

## 7. Email extraction

When pulling emails from bios and captions:

### Strict matching (high confidence)

```regex
\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b
```

Filtered against:
- Local part length ≥2
- Skip if ends with image extensions (`.png`, `.jpg`, `.gif`, `.mp4`, `.webp`)
- TLD must be in valid list (`com`, `net`, `org`, `io`, `co`, `me`, `tv`, country codes, `icloud`, `gmail`, etc.)

### Obfuscation patterns (use sparingly)

Require explicit brackets to avoid false positives from prose like "appreciate.in":

```regex
\b([A-Za-z0-9._%+\-]+)\s*[\[({<]\s*(?:at|@)\s*[\])}>]\s*([A-Za-z0-9.\-]+)\s*(?:[\[({<]\s*(?:dot|\.)\s*[\])}>]|\.)\s*([A-Za-z]{2,})\b
```

Only match when "at" is surrounded by `[]`, `()`, `{}`, or `<>`. Without explicit brackets, bare "at" inside words like "appreciate" produces too many false positives.

### Business vs personal classification

A local part containing any of these is classified as `business`:

```
business, partnership, pr, press, inquiries, contact,
collab, collabs, sponsor, marketing, media, hello,
info, team, booking, sales
```

Otherwise `personal`. Business addresses are preferred in `email_chosen`.

---

## 8. Maintenance notes

### When to re-score
- **On import**: scores computed from the seed CSV row
- **Nightly stats refresh cron** (Phase 6): re-compute all components using fresh follower/ER/activity data
- **On manual edit**: if someone changes a creator's bio or notes, watch_score should re-compute

### When to update the vocabulary
- New brands enter the watch market (microbrand world moves fast)
- New campaign hashtags from Fitwell
- New product lines (e.g., if we add Apple Watch–only buckles, boost `apple watch` weight)
- Document changes in this file with the rationale and a date

### When to update the weights
- Re-weighting (e.g., shifting from 30% relevance to 40%) should be discussed with Greg first, ideally with a back-test against a hand-labeled set of "yes / maybe / no" creators
- Avoid silent recalibration — the rankings drive outreach prioritisation, and inconsistency erodes trust in the system

---

## 9. Honest limitations

- **Watch_score isn't comparable across data depths.** An IG creator with full caption data (12 posts) and one with bio only (Apify base scrape) will score very differently even if equally watch-focused. The `data_source` field in the unified CSV indicates depth. Mitigation: bucket comparisons within same data source.
- **Engagement rate gets inflated for small accounts.** A creator with 1K followers and one viral post showing 1500 likes will compute ER% > 100. Cap engagement component at 100 in fit_score; flag any raw ER > 30% for manual review.
- **English-only keyword vocabulary.** A French or Italian horology creator may score low even if they're a great fit. Extending the vocabulary for major non-English watch markets is a Phase-7 enhancement.
- **No semantic understanding.** Keyword matching can't tell that "I bought a watch as a gift for my dad" is unrelated to watch-content creation. Fine at the aggregate, occasionally noisy at the row level.
