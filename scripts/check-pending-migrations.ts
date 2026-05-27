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
 * Exit codes:
 *   0 — up-to-date
 *   1 — pending migrations exist (so it can gate hooks / scripts)
 *   2 — bad config (missing DATABASE_URL)
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const journalPath = path.join("drizzle", "migrations", "meta", "_journal.json");
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

const appliedCount = applied.length;
const onDisk = journal.entries.length;
const target = new URL(process.env.DATABASE_URL).host;

if (appliedCount >= onDisk) {
  console.log(`✓ Up-to-date on ${target}: ${appliedCount}/${onDisk} migrations applied.`);
  process.exit(0);
}

const pending = journal.entries.slice(appliedCount);
console.log(`⚠ ${pending.length} pending migration(s) on ${target}:`);
for (const entry of pending) {
  console.log(`  - ${entry.tag}.sql`);
}
console.log(`\nApplied: ${appliedCount}/${onDisk}`);
console.log("Run `npm run db:migrate` (dev) or `npm run db:migrate:prod` (prod) to apply.");
process.exit(1);
