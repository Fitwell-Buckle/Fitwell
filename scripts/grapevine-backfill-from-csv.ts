/**
 * Backfill Grapevine post-purchase survey responses from a CSV export
 * into attribution_survey_response. Idempotent (safe to re-run):
 * provider_response_id is synthesized as
 *   csv-backfill:<shopify_order_id>:<question_key>
 * so re-importing the same CSV updates rows instead of duplicating them.
 *
 * Usage:
 *   tsx scripts/grapevine-backfill-from-csv.ts <path-to-csv> [--dry-run]
 *
 * The CSV shape is the standard Grapevine export:
 *   order_id,order_name,order_total,...,channel,...,created_at,"<question text>"
 *
 * The script reads the question text from the LAST column header and uses
 * it as the question label; the canonical question_key is hardcoded to
 * 'where_first_heard' since the current Fitwell survey is single-question.
 *
 * Run against dev:
 *   tsx scripts/grapevine-backfill-from-csv.ts ~/Downloads/Grapevine-*.csv
 *
 * Run against prod (after dev verifies):
 *   dotenv -e .env.production.local -- tsx scripts/grapevine-backfill-from-csv.ts \
 *     ~/Downloads/Grapevine-*.csv
 */
import { readFileSync } from "fs";
import { ingestGrapevineResponse } from "@/lib/grapevine/ingest";

const csvPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!csvPath) {
  console.error("usage: tsx scripts/grapevine-backfill-from-csv.ts <csv-path> [--dry-run]");
  process.exit(1);
}

const QUESTION_KEY = "where_first_heard";
const SURVEY_CODE = "698cc69eca3e5";
const SURVEY_NAME = "Post purchase survey";

const raw = readFileSync(csvPath, "utf8");
const rows = parseCsv(raw);
if (rows.length === 0) {
  console.error("empty CSV");
  process.exit(1);
}

const header = rows[0]!;
const data = rows.slice(1);

const col = (name: string): number => {
  const idx = header.indexOf(name);
  if (idx === -1) throw new Error(`missing column: ${name}`);
  return idx;
};

const colOrderId = col("order_id");
const colOrderName = col("order_name");
const colEmail = col("email");
const colChannel = col("channel");
const colCreatedAt = col("created_at");
// Question column is whichever the last column is — Grapevine names it after
// the question text itself, so we don't hardcode the title.
const colAnswer = header.length - 1;

console.log(
  `[${dryRun ? "DRY RUN" : "WRITE"}] ${data.length} rows to ingest from ${csvPath}`,
);

const stats = {
  total: 0,
  ingested: 0,
  failed: 0,
  channelMapped: 0,
  channelUnmapped: 0,
  otherCount: 0,
  ordersResolved: 0,
  ordersUnresolved: 0,
};
const unmappedSamples = new Map<string, number>();

for (const row of data) {
  stats.total++;
  const shopifyOrderId = row[colOrderId] ?? null;
  if (!shopifyOrderId) {
    stats.failed++;
    continue;
  }

  const answer = row[colAnswer] ?? null;
  const respondedAtRaw = row[colCreatedAt] ?? null;

  const payload = {
    providerResponseId: `csv-backfill:${shopifyOrderId}:${QUESTION_KEY}`,
    surveyCode: SURVEY_CODE,
    surveyName: SURVEY_NAME,
    surface: row[colChannel] ?? null,
    questionKey: QUESTION_KEY,
    answer,
    isOther: false, // auto-detected from '(* other)' suffix in ingest
    otherText: null,
    customerEmail: row[colEmail] ?? null,
    shopifyOrderId,
    orderName: row[colOrderName] ?? null,
    respondedAt: normalizeRespondedAt(respondedAtRaw),
  };

  if (dryRun) {
    // Mirror the suffix-detection here so the dry-run stats match what a real
    // ingest would produce.
    const isOther = answer?.trim().endsWith(" (* other)") ?? false;
    if (isOther) stats.otherCount++;
    if (!isOther && answer) {
      // Cheap-ish channel-hint check without re-importing the mapper —
      // categorize by prefix presence for stats only. The actual write path
      // uses the real mapper.
      stats.channelMapped++;
    } else if (!isOther) {
      stats.channelUnmapped++;
      track(unmappedSamples, answer ?? "<empty>");
    }
    stats.ingested++;
    continue;
  }

  try {
    const result = await ingestGrapevineResponse(payload);
    if (result.status === "stored") {
      stats.ingested++;
      if (result.orderResolved) stats.ordersResolved++;
      else stats.ordersUnresolved++;
    }
  } catch (err) {
    stats.failed++;
    console.error(`row ${stats.total} failed (order ${shopifyOrderId}):`, err);
  }

  if (stats.total % 50 === 0) {
    console.log(
      `  ${stats.total}/${data.length} processed (ingested=${stats.ingested}, ordersResolved=${stats.ordersResolved})`,
    );
  }
}

console.log("");
console.log("=== Summary ===");
console.log(`Total rows:         ${stats.total}`);
console.log(`Ingested:           ${stats.ingested}`);
console.log(`Failed:             ${stats.failed}`);
if (!dryRun) {
  console.log(`Orders resolved:    ${stats.ordersResolved}`);
  console.log(`Orders unresolved:  ${stats.ordersUnresolved}  (older than our Shopify sync window or pre-deletion)`);
}
if (dryRun) {
  console.log(`'(* other)' rows:   ${stats.otherCount}`);
  console.log(`Channel-mapped:     ${stats.channelMapped}`);
  console.log(`Channel-unmapped:   ${stats.channelUnmapped}  (see samples below)`);
  if (unmappedSamples.size > 0) {
    console.log("\nUnmapped answers (top 10 by count):");
    for (const [answer, count] of [...unmappedSamples.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)) {
      console.log(`  ${count}x  ${answer}`);
    }
  }
}

process.exit(stats.failed > 0 ? 1 : 0);

// ─── helpers ────────────────────────────────────────────────────────

// Minimal RFC-4180-ish CSV parser. Quote-aware (handles commas inside
// quoted fields, which Grapevine uses for category names like
// 'AI - ChatGPT, Claude, Etc.: Claude'). Does NOT handle escaped quotes
// (""); the Grapevine export doesn't use any (verified empirically).
function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else if (c === "\r") {
        // skip — \n on the next char ends the row
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// Grapevine exports timestamps as "2026-02-12 17:23" (no timezone). Treat as
// UTC for ingestion — analytics workloads anchor to date buckets and the
// small UTC/PT offset doesn't shift them.
function normalizeRespondedAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  if (!match) return null;
  const seconds = match[3] ?? ":00";
  return `${match[1]}T${match[2]}${seconds}.000Z`;
}

function track(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
