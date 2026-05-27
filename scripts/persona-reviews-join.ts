/**
 * Join Judge.me reviews to behavioral segments from customer-segments.json.
 * For each behavioral segment, surface:
 *   - how many customers in that segment have left a review
 *   - average rating and review length per segment
 *   - distinctive vocabulary per segment (vs. the others)
 *   - representative quote samples
 */
import { readFileSync, writeFileSync } from "node:fs";

const REVIEWS_CSV =
  process.argv[2] ??
  "/Users/tomsimson/Downloads/-review-export%2Ffitwell-buckles-all-published-reviews-in-judgeme-format-2026-05-26-1779816590.csv";
const SEGMENTS_JSON =
  process.argv[3] ?? "/Users/tomsimson/code/Fitwell/data/customer-segments.json";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (c === "\n" || c === "\r") {
        row.push(field);
        rows.push(row);
        field = "";
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i += 2;
        else i++;
      } else {
        field += c;
        i++;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].length > 0));
}

type Segment =
  | "P1_outfitter"
  | "P_curator"
  | "P_bulk_single"
  | "P_single_repeat"
  | "P_single_buyer";

const segmentLabel: Record<Segment, string> = {
  P1_outfitter: "Outfitter (3+ orders OR 5+ units)",
  P_curator: "Curator (multi-unit, $80+ AOV)",
  P_bulk_single: "Bulk Single (1 order, 3-4 units)",
  P_single_repeat: "Single Repeat (2 orders, small)",
  P_single_buyer: "Single Buyer (1 order, 1 unit)",
};

type CustomerRecord = {
  email: string;
  segment: Segment;
  firstMonth: string;
  lastMonth: string;
  orderCount: number;
  totalQty: number;
  totalSpend: number;
  channels: string[];
};

const segmentsData: CustomerRecord[] = JSON.parse(readFileSync(SEGMENTS_JSON, "utf-8"));
const byEmail = new Map<string, CustomerRecord>();
for (const c of segmentsData) byEmail.set(c.email.toLowerCase(), c);

// Parse reviews
const reviewsRaw = readFileSync(REVIEWS_CSV, "utf-8");
const reviewsRows = parseCsv(reviewsRaw);
const rHeader = reviewsRows[0];
const ri = {
  title: rHeader.indexOf("title"),
  body: rHeader.indexOf("body"),
  rating: rHeader.indexOf("rating"),
  date: rHeader.indexOf("review_date"),
  email: rHeader.indexOf("reviewer_email"),
  name: rHeader.indexOf("reviewer_name"),
  product: rHeader.indexOf("product_handle"),
  location: rHeader.indexOf("location"),
};

type Review = {
  title: string;
  body: string;
  rating: number;
  date: string;
  email: string;
  name: string;
  product: string;
  location: string;
};
const reviews: Review[] = reviewsRows.slice(1).map((r) => ({
  title: r[ri.title] ?? "",
  body: r[ri.body] ?? "",
  rating: Number(r[ri.rating] ?? "0"),
  date: r[ri.date] ?? "",
  email: (r[ri.email] ?? "").toLowerCase(),
  name: r[ri.name] ?? "",
  product: r[ri.product] ?? "",
  location: r[ri.location] ?? "",
}));

const reviewsByEmail = new Map<string, Review[]>();
for (const r of reviews) {
  if (!r.email) continue;
  const list = reviewsByEmail.get(r.email) ?? [];
  list.push(r);
  reviewsByEmail.set(r.email, list);
}

console.log(`== INPUT ==`);
console.log(`Reviews in file:                   ${reviews.length}`);
console.log(`Unique reviewer emails:            ${reviewsByEmail.size}`);
console.log(`Customer segment records:          ${segmentsData.length}`);

// Join
const matched: { customer: CustomerRecord; reviews: Review[] }[] = [];
const unmatchedReviewers: { email: string; reviews: Review[] }[] = [];
for (const [email, revs] of reviewsByEmail) {
  const cust = byEmail.get(email);
  if (cust) matched.push({ customer: cust, reviews: revs });
  else unmatchedReviewers.push({ email, reviews: revs });
}

console.log(`Reviewers matched to a customer:   ${matched.length}`);
console.log(
  `Reviewers NOT in segments (older / wholesale / typo'd email): ${unmatchedReviewers.length}`,
);

// Per-segment stats
type SegmentStats = {
  segment: Segment;
  totalCustomers: number;
  reviewers: number;
  reviewerPct: number;
  totalReviews: number;
  avgRating: number;
  avgBodyChars: number;
  quotes: { email: string; rating: number; title: string; body: string }[];
};

const customerCountBySegment = new Map<Segment, number>();
for (const c of segmentsData) {
  customerCountBySegment.set(c.segment, (customerCountBySegment.get(c.segment) ?? 0) + 1);
}

const statsBySegment = new Map<Segment, SegmentStats>();
function ensure(seg: Segment): SegmentStats {
  let s = statsBySegment.get(seg);
  if (!s) {
    s = {
      segment: seg,
      totalCustomers: customerCountBySegment.get(seg) ?? 0,
      reviewers: 0,
      reviewerPct: 0,
      totalReviews: 0,
      avgRating: 0,
      avgBodyChars: 0,
      quotes: [],
    };
    statsBySegment.set(seg, s);
  }
  return s;
}

for (const m of matched) {
  const s = ensure(m.customer.segment);
  s.reviewers += 1;
  for (const r of m.reviews) {
    s.totalReviews += 1;
    s.avgRating += r.rating;
    s.avgBodyChars += r.body.length;
    if (s.quotes.length < 5 && r.body.length > 40) {
      s.quotes.push({ email: m.customer.email, rating: r.rating, title: r.title, body: r.body });
    }
  }
}
for (const s of statsBySegment.values()) {
  if (s.totalReviews > 0) {
    s.avgRating = s.avgRating / s.totalReviews;
    s.avgBodyChars = s.avgBodyChars / s.totalReviews;
  }
  if (s.totalCustomers > 0) s.reviewerPct = (100 * s.reviewers) / s.totalCustomers;
}

const segOrder: Segment[] = [
  "P1_outfitter",
  "P_curator",
  "P_bulk_single",
  "P_single_repeat",
  "P_single_buyer",
];

console.log(`\n== REVIEW BEHAVIOR BY SEGMENT ==\n`);
console.log(
  [
    "segment".padEnd(38),
    "cust".padStart(5),
    "reviewers".padStart(10),
    "rate".padStart(6),
    "reviews".padStart(8),
    "avgRtng".padStart(8),
    "avgChars".padStart(9),
  ].join("  "),
);
console.log("-".repeat(95));
for (const seg of segOrder) {
  const s = statsBySegment.get(seg);
  if (!s) {
    const total = customerCountBySegment.get(seg) ?? 0;
    console.log(
      [
        segmentLabel[seg].padEnd(38),
        String(total).padStart(5),
        "0".padStart(10),
        "0.0%".padStart(6),
        "0".padStart(8),
        "-".padStart(8),
        "-".padStart(9),
      ].join("  "),
    );
    continue;
  }
  console.log(
    [
      segmentLabel[seg].padEnd(38),
      String(s.totalCustomers).padStart(5),
      String(s.reviewers).padStart(10),
      `${s.reviewerPct.toFixed(1)}%`.padStart(6),
      String(s.totalReviews).padStart(8),
      s.avgRating.toFixed(2).padStart(8),
      s.avgBodyChars.toFixed(0).padStart(9),
    ].join("  "),
  );
}
console.log("-".repeat(95));
const totalReviewers = matched.length;
const totalReviewerCust = segmentsData.length;
const totalReviewsMatched = matched.reduce((s, m) => s + m.reviews.length, 0);
console.log(
  `Overall reviewer rate (matched to customers): ${totalReviewers}/${totalReviewerCust} = ${((100 * totalReviewers) / totalReviewerCust).toFixed(1)}%`,
);

// Vocabulary analysis: TF-IDF-ish — words that appear disproportionately in one segment
const stopwords = new Set(
  "a about above after again against all am an and any are arent as at be because been before being below between both but by cant cannot could couldnt did didnt do does doesnt doing dont down during each few for from further had hadnt has hasnt have havent having he hed hell hes her here heres hers herself him himself his how hows i id ill im ive if in into is isnt it its itself lets me more most mustnt my myself no nor not of off on once only or other ought our ours ourselves out over own same shall shant she shed shell shes should shouldnt so some such than that thats the their theirs them themselves then there theres these they theyd theyll theyre theyve this those through to too under until up very was wasnt we wed well were werent weve what whats when whens where wheres which while who whos whom why whys with wont would wouldnt you youd youll youre youve your yours yourself yourselves get got just like really one two three four five six seven eight nine ten also able now will way back side made make take goes going still even though much will product buckle clasp strap straps watch watches".split(
      / +/,
    ),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}

const wordSegmentCount = new Map<string, Map<Segment, number>>();
const segmentTokenCount = new Map<Segment, number>();
for (const m of matched) {
  const seg = m.customer.segment;
  for (const r of m.reviews) {
    const text = `${r.title} ${r.body}`;
    const tokens = tokenize(text);
    segmentTokenCount.set(seg, (segmentTokenCount.get(seg) ?? 0) + tokens.length);
    for (const w of tokens) {
      let m2 = wordSegmentCount.get(w);
      if (!m2) {
        m2 = new Map();
        wordSegmentCount.set(w, m2);
      }
      m2.set(seg, (m2.get(seg) ?? 0) + 1);
    }
  }
}

// For each segment, find words with highest (count_in_segment / count_in_corpus)
const totalTokens = [...segmentTokenCount.values()].reduce((a, b) => a + b, 0);

type WordScore = { word: string; segCount: number; pctInSeg: number; lift: number };
function distinctiveWordsFor(seg: Segment, minSegCount = 2): WordScore[] {
  const segTokens = segmentTokenCount.get(seg) ?? 0;
  if (segTokens === 0) return [];
  const scores: WordScore[] = [];
  for (const [word, segMap] of wordSegmentCount) {
    const segCount = segMap.get(seg) ?? 0;
    if (segCount < minSegCount) continue;
    const cnt = [...segMap.values()].reduce((a, b) => a + b, 0);
    const pctInSeg = segCount / segTokens;
    const pctInCorpus = cnt / totalTokens;
    const lift = pctInSeg / pctInCorpus;
    scores.push({ word, segCount, pctInSeg, lift });
  }
  scores.sort((a, b) => b.lift - a.lift);
  return scores.slice(0, 8);
}

console.log(`\n== DISTINCTIVE VOCABULARY BY SEGMENT (lift over corpus baseline) ==`);
for (const seg of segOrder) {
  const words = distinctiveWordsFor(seg);
  if (words.length === 0) continue;
  console.log(`\n  ${segmentLabel[seg]}:`);
  console.log(`    ${words.map((w) => `"${w.word}" (${w.segCount}x, ${w.lift.toFixed(1)}x lift)`).join(", ")}`);
}

console.log(`\n== REPRESENTATIVE QUOTES BY SEGMENT ==`);
for (const seg of segOrder) {
  const s = statsBySegment.get(seg);
  if (!s || s.quotes.length === 0) continue;
  console.log(`\n  ${segmentLabel[seg]}:`);
  for (const q of s.quotes.slice(0, 3)) {
    const body = q.body.length > 200 ? q.body.slice(0, 200) + "…" : q.body;
    console.log(`    [${q.rating}★] "${q.title}" — ${q.email}`);
    console.log(`      ${body.replace(/\n/g, " ")}`);
  }
}

// Top reviewers from Outfitter segment (named, for outreach candidates)
const outfitterReviewers = matched
  .filter((m) => m.customer.segment === "P1_outfitter")
  .sort((a, b) => b.customer.totalSpend - a.customer.totalSpend);
console.log(`\n== OUTFITTERS WHO REVIEWED (creator program / advocate candidates) ==`);
for (const m of outfitterReviewers.slice(0, 10)) {
  const r = m.reviews[0];
  console.log(
    `  $${m.customer.totalSpend.toFixed(0).padStart(4)}  ${String(m.customer.orderCount).padStart(2)} orders / ${String(m.customer.totalQty).padStart(2)} units  ${m.customer.email.padEnd(35)}  [${r.rating}★] "${r.title}"`,
  );
}

// Write enriched dataset to disk for follow-up analysis
const enriched = matched.map((m) => ({
  email: m.customer.email,
  segment: m.customer.segment,
  orderCount: m.customer.orderCount,
  totalQty: m.customer.totalQty,
  totalSpend: m.customer.totalSpend,
  channels: m.customer.channels,
  reviews: m.reviews.map((r) => ({
    rating: r.rating,
    title: r.title,
    body: r.body,
    date: r.date,
    product: r.product,
    location: r.location,
  })),
}));
writeFileSync(
  "/Users/tomsimson/code/Fitwell/data/customers-with-reviews.json",
  JSON.stringify(enriched, null, 2),
);
console.log(
  `\nWrote enriched join (${enriched.length} customers with reviews) to data/customers-with-reviews.json`,
);
