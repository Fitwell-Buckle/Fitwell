/**
 * Compares migration state across three places: local journal,
 * origin/main journal, and the production __drizzle_migrations table.
 *
 * Specifically answers: was 0020_fine_night_thrasher (the Klaviyo
 * migration) ever applied to prod? If yes, what's its timestamp?
 *
 * Drizzle tracks migrations by content HASH (not filename), so
 * renaming/renumbering on disk is safe as long as we update the
 * journal entry to match. The hash is the same SHA-256 over the
 * migration SQL contents that drizzle-kit writes into the journal.
 *
 * Read-only against prod. Run via: npm run db:pending:prod-pattern
 * (or manually with the prod env file).
 */
import { neon } from "@neondatabase/serverless";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

type JournalEntry = { idx: number; tag: string; when: number };
type Journal = { entries: JournalEntry[] };

const localJournalPath = path.join(
  "drizzle",
  "migrations",
  "meta",
  "_journal.json",
);
const local: Journal = JSON.parse(fs.readFileSync(localJournalPath, "utf8"));

// Pull origin/main journal via git show
let remote: Journal;
try {
  const remoteJson = execSync(
    `git show origin/main:${localJournalPath}`,
    { encoding: "utf8" },
  );
  remote = JSON.parse(remoteJson);
} catch (e) {
  console.error(
    "Couldn't read origin/main journal — did you `git fetch` first?",
  );
  throw e;
}

const sql = neon(process.env.DATABASE_URL);
const applied = (await sql`
  SELECT hash, created_at
  FROM drizzle.__drizzle_migrations
  ORDER BY created_at ASC
`) as { hash: string; created_at: string }[];

const target = new URL(process.env.DATABASE_URL).host;

console.log(`\n═══ Migration state report ═══`);
console.log(`Target DB: ${target}\n`);

console.log(`Local journal (HEAD):     ${local.entries.length} entries`);
console.log(`Remote journal (origin/main): ${remote.entries.length} entries`);
console.log(`Prod __drizzle_migrations:    ${applied.length} rows\n`);

// Drizzle stores `when` in journal as ms-since-epoch; created_at in the
// table is a timestamp. Match by closest timestamp.
function whenToIso(when: number): string {
  return new Date(when).toISOString();
}

function findByWhen(
  rows: { hash: string; created_at: string }[],
  when: number,
): { hash: string; created_at: string } | null {
  const target = new Date(when).getTime();
  let best: { row: (typeof rows)[number]; diffMs: number } | null = null;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    const diff = Math.abs(t - target);
    if (!best || diff < best.diffMs) best = { row: r, diffMs: diff };
  }
  // Within a 60s window we consider it a match (Drizzle records the
  // journal `when` at generation time; created_at is set at apply
  // time, but they're usually close. Looser if needed.)
  if (best && best.diffMs < 60_000) return best.row;
  return null;
}

// 1) Map local journal entries to prod rows by timestamp
console.log("Local entries vs prod __drizzle_migrations:");
console.log("───────────────────────────────────────────");
for (const entry of local.entries) {
  const hit = findByWhen(applied, entry.when);
  const status = hit ? "✓ in prod" : "✗ NOT in prod";
  console.log(
    `  ${String(entry.idx).padStart(4)} ${entry.tag.padEnd(40)} ${whenToIso(entry.when)} ${status}`,
  );
}

// 2) Show what's on remote (origin/main) that's NOT in local
console.log("\nRemote entries (origin/main) — index >= local's last:");
console.log("─────────────────────────────────────────────────────");
const localMaxIdx = Math.max(...local.entries.map((e) => e.idx));
const localTags = new Set(local.entries.map((e) => e.tag));
for (const entry of remote.entries) {
  if (entry.idx <= localMaxIdx && localTags.has(entry.tag)) continue;
  const hit = findByWhen(applied, entry.when);
  const status = hit ? "✓ in prod" : "✗ NOT in prod";
  console.log(
    `  ${String(entry.idx).padStart(4)} ${entry.tag.padEnd(40)} ${whenToIso(entry.when)} ${status}`,
  );
}

// 3) Show prod rows that didn't match anything in local
console.log("\nProd rows with NO match in local journal:");
console.log("─────────────────────────────────────────");
const allKnownTimestamps = new Set(local.entries.map((e) => e.when));
let unmatched = 0;
for (const row of applied) {
  const t = new Date(row.created_at).getTime();
  let matched = false;
  for (const w of allKnownTimestamps) {
    if (Math.abs(t - w) < 60_000) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    unmatched++;
    console.log(`  hash=${row.hash.slice(0, 12)}…  created_at=${row.created_at}`);
  }
}
if (unmatched === 0) {
  console.log("  (none — every prod row maps to a local journal entry)");
}

// 4) Specifically check the Klaviyo migration on disk
console.log("\nKlaviyo migration (0020_fine_night_thrasher) check:");
console.log("───────────────────────────────────────────────────");
const klaviyoEntry = local.entries.find((e) =>
  e.tag.includes("fine_night_thrasher"),
);
if (!klaviyoEntry) {
  console.log("  No matching entry found in local journal.");
} else {
  console.log(`  Local journal entry: idx=${klaviyoEntry.idx}, tag=${klaviyoEntry.tag}, when=${whenToIso(klaviyoEntry.when)}`);
  const hit = findByWhen(applied, klaviyoEntry.when);
  if (hit) {
    console.log(
      `  ✓ Applied to prod at ${hit.created_at} (hash=${hit.hash.slice(0, 12)}…)`,
    );
    console.log(
      "  → Renumbering the FILE is safe; we just need to keep the journal entry's `when` so it still matches this prod row.",
    );
  } else {
    console.log(
      "  ✗ NOT applied to prod. The migration is on local disk but the prod __drizzle_migrations table has no row matching its timestamp.",
    );
    console.log(
      "  → Path (b) — drop the local commit, pull, re-apply as a fresh migration — is the cleanest move.",
    );
  }
}

// 5) Also try matching the actual SHA-256 of the file content, since
//    Drizzle's hash is derived from the SQL contents (best-effort —
//    if Drizzle's algorithm includes salts/normalization the hash
//    won't match, but it's worth checking).
const klaviyoSqlPath = path.join(
  "drizzle",
  "migrations",
  "0020_fine_night_thrasher.sql",
);
if (fs.existsSync(klaviyoSqlPath)) {
  const contents = fs.readFileSync(klaviyoSqlPath, "utf8");
  const sha = createHash("sha256").update(contents).digest("hex");
  console.log(`\n  Local file SHA-256: ${sha}`);
  const hashMatch = applied.find((r) => r.hash === sha);
  if (hashMatch) {
    console.log(`  ✓ Exact hash match in prod at ${hashMatch.created_at}`);
  } else {
    console.log(
      "  (no exact SHA-256 match in prod — Drizzle may use a different hash algorithm; trust the timestamp check above)",
    );
  }
}
