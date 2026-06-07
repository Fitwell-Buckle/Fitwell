/**
 * One-shot backfill that closes the gap on suppliers + companies created
 * BEFORE the auto-promote logic landed: any row whose `contact_email` is set
 * but doesn't have a matching `supplier_contact` / `company_contact` row was
 * silently failing magic-link sign-in. This walks both tables and inserts the
 * missing portal-login rows. Idempotent — re-running is a no-op.
 *
 * Dry-run by default. Pass `--apply` to actually write.
 *
 * Run against dev:
 *   node --env-file=.env.local --import tsx/esm \
 *     scripts/backfill-portal-logins.ts
 *
 * Run against prod (pulls + uses prod env, then deletes the temp file):
 *   npm run backfill:portal-logins:prod              # dry-run
 *   npm run backfill:portal-logins:prod -- --apply   # write
 */
import { neon } from "@neondatabase/serverless";

const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL);
const target = new URL(process.env.DATABASE_URL).host;

console.log(
  `Backfill portal logins on ${target}  (${apply ? "APPLY — writes will happen" : "DRY RUN — no writes"})\n`,
);

// Suppliers ─ contact_email is set, but no matching supplier_contact row for
// THIS supplier. We don't try to fix mis-assignments to other suppliers; the
// `supplier_contact.email` uniqueness index means an address can only attach
// to one supplier — the existing assignment wins and we report it as a skip.
const supplierGaps = (await sql`
  SELECT
    s.id           AS supplier_id,
    s.name         AS supplier_name,
    s.contact_name AS contact_name,
    LOWER(TRIM(s.contact_email)) AS email,
    (SELECT supplier_id FROM supplier_contact
     WHERE email = LOWER(TRIM(s.contact_email))) AS existing_owner_id
  FROM supplier s
  WHERE COALESCE(s.contact_email, '') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM supplier_contact sc
      WHERE sc.supplier_id = s.id
        AND sc.email = LOWER(TRIM(s.contact_email))
    )
`) as Array<{
  supplier_id: string;
  supplier_name: string;
  contact_name: string | null;
  email: string;
  existing_owner_id: string | null;
}>;

let supplierAdded = 0;
let supplierSkipped = 0;
for (const row of supplierGaps) {
  // Email already owned by another supplier → can't dual-assign (unique
  // index). Surface as a manual cleanup item.
  if (row.existing_owner_id && row.existing_owner_id !== row.supplier_id) {
    console.log(
      `  ⚠ skip  ${row.email} on "${row.supplier_name}" — already a login on supplier ${row.existing_owner_id}`,
    );
    supplierSkipped++;
    continue;
  }
  console.log(`  +     ${row.email} → supplier "${row.supplier_name}"`);
  if (apply) {
    await sql`
      INSERT INTO supplier_contact (supplier_id, email, name)
      VALUES (${row.supplier_id}, ${row.email}, ${row.contact_name})
      ON CONFLICT (email) DO NOTHING
    `;
  }
  supplierAdded++;
}
console.log(
  `\nsupplier_contact: ${supplierAdded} ${apply ? "added" : "would add"}, ${supplierSkipped} skipped (already on a different supplier)\n`,
);

// Companies ─ same pattern.
const companyGaps = (await sql`
  SELECT
    c.id           AS company_id,
    c.name         AS company_name,
    c.contact_name AS contact_name,
    LOWER(TRIM(c.contact_email)) AS email,
    (SELECT company_id FROM company_contact
     WHERE email = LOWER(TRIM(c.contact_email))) AS existing_owner_id
  FROM company c
  WHERE COALESCE(c.contact_email, '') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM company_contact cc
      WHERE cc.company_id = c.id
        AND cc.email = LOWER(TRIM(c.contact_email))
    )
`) as Array<{
  company_id: string;
  company_name: string;
  contact_name: string | null;
  email: string;
  existing_owner_id: string | null;
}>;

let companyAdded = 0;
let companySkipped = 0;
for (const row of companyGaps) {
  if (row.existing_owner_id && row.existing_owner_id !== row.company_id) {
    console.log(
      `  ⚠ skip  ${row.email} on "${row.company_name}" — already a login on company ${row.existing_owner_id}`,
    );
    companySkipped++;
    continue;
  }
  console.log(`  +     ${row.email} → company "${row.company_name}"`);
  if (apply) {
    await sql`
      INSERT INTO company_contact (company_id, email, name)
      VALUES (${row.company_id}, ${row.email}, ${row.contact_name})
      ON CONFLICT (email) DO NOTHING
    `;
  }
  companyAdded++;
}
console.log(
  `\ncompany_contact: ${companyAdded} ${apply ? "added" : "would add"}, ${companySkipped} skipped (already on a different company)`,
);

if (!apply && (supplierAdded > 0 || companyAdded > 0)) {
  console.log("\nRe-run with --apply to write these inserts.");
}
