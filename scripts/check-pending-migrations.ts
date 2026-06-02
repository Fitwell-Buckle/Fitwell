/**
 * Read-only check that compares the migration journal on disk
 * (drizzle/migrations/meta/_journal.json) against the
 * drizzle.__drizzle_migrations bookkeeping table on the DB
 * pointed at by DATABASE_URL.
 *
 * Reports any migrations that exist on disk but haven't been
 * applied yet. Used by:
 *   npm run db:pending       (against your dev branch)
 *   npm run db:pending:prod  (pulls prod env first, then runs against production)
 *
 * Each on-disk journal entry is hashed (sha256 of the raw .sql file —
 * matches drizzle-orm's algorithm in node_modules/drizzle-orm/migrator.cjs)
 * and looked up in the prod __drizzle_migrations table. ANY entry on
 * disk that isn't applied → exit 1 with the list of missing migrations,
 * even if the prod table has MORE rows than the on-disk journal (which
 * is exactly the case where the prior count-only check silently passed
 * and let me almost push a duplicate-numbered migration on 2026-06-02).
 *
 * Exit codes:
 *   0 — up-to-date (every on-disk migration has a matching prod row)
 *   1 — pending migrations exist on disk that aren't applied to prod
 *   2 — bad config (missing DATABASE_URL or unreadable migrations folder)
 */
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const migrationsDir = path.join("drizzle", "migrations");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
  entries: { idx: number; tag: string; when: number }[];
};

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL);

let applied: { hash: string; created_at: string }[];
try {
  applied = (await sql`
    SELECT hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at ASC
  `) as { hash: string; created_at: string }[];
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("does not exist")) {
    applied = [];
  } else {
    throw e;
  }
}

const appliedHashes = new Set(applied.map((r) => r.hash));
const target = new URL(process.env.DATABASE_URL).host;

// Compute the hash of each on-disk journal entry's SQL file using the
// same algorithm drizzle-orm uses (sha256 of the raw .sql contents).
const pending: { tag: string; reason: string }[] = [];
for (const entry of journal.entries) {
  const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`);
  if (!fs.existsSync(sqlPath)) {
    pending.push({
      tag: entry.tag,
      reason: "SQL file missing from disk (journal entry exists but file doesn't)",
    });
    continue;
  }
  const contents = fs.readFileSync(sqlPath, "utf8");
  const hash = createHash("sha256").update(contents).digest("hex");
  if (!appliedHashes.has(hash)) {
    pending.push({ tag: entry.tag, reason: "not applied to target DB" });
  }
}

const onDisk = journal.entries.length;
const appliedCount = applied.length;

if (pending.length === 0) {
  // Up-to-date — but if the DB has more migrations than the on-disk
  // journal, the local clone is *behind* even though the push won't
  // break prod. Note it so the user knows to pull.
  const extra = appliedCount - onDisk;
  const extraNote =
    extra > 0
      ? ` (DB has ${extra} migration(s) not in local journal — local is behind; consider \`git pull\`)`
      : "";
  console.log(
    `✓ Up-to-date on ${target}: ${onDisk}/${onDisk} on-disk migrations applied${extraNote}.`,
  );
  process.exit(0);
}

console.log(`⚠ ${pending.length} pending migration(s) on ${target}:`);
for (const p of pending) {
  console.log(`  - ${p.tag}.sql  (${p.reason})`);
}
console.log(`\nApplied to DB: ${appliedCount}  ·  On disk: ${onDisk}`);
console.log("Run `npm run db:migrate` (dev) or `npm run db:migrate:prod` (prod) to apply.");
process.exit(1);
