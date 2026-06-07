/**
 * Diagnose why a magic-link sign-in didn't arrive for a given email.
 *
 * Two paths can silently swallow a sign-in attempt:
 *   1. The address isn't in `supplier_contact` (or `company_contact`) → the
 *      auth `signIn` callback returns false → no link is sent, but the
 *      /supplier/login UI still shows "Check your email" (no visible error).
 *   2. The allowlist passes but Resend isn't configured → the magic link is
 *      logged to the Vercel function output instead of emailed.
 *
 * This script checks (1). For (2), grep the Vercel function logs for
 * "Magic sign-in link for <email>".
 *
 * Run against your dev DB:
 *   node --env-file=.env.local --import tsx/esm \
 *     scripts/check-supplier-login.ts oliver.r@gmail.com
 *
 * Run against prod (pulls + uses prod env, then deletes the temp file):
 *   npm run check:supplier-login:prod oliver.r@gmail.com
 */
import { neon } from "@neondatabase/serverless";

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: check-supplier-login.ts <email>");
  process.exit(2);
}
const email = raw.trim().toLowerCase();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL);
const target = new URL(process.env.DATABASE_URL).host;

console.log(`Looking up "${email}" on ${target}\n`);

// 1. Is the address in the supplier-portal allowlist?
const supplierRows = (await sql`
  SELECT sc.id, sc.email, sc.name, sc.supplier_id, s.name AS supplier_name
  FROM supplier_contact sc
  JOIN supplier s ON s.id = sc.supplier_id
  WHERE sc.email = ${email}
`) as Array<{
  id: string;
  email: string;
  name: string | null;
  supplier_id: string;
  supplier_name: string;
}>;

if (supplierRows.length > 0) {
  console.log("✓ Found in supplier_contact:");
  for (const r of supplierRows) {
    console.log(
      `  • ${r.email} → supplier "${r.supplier_name}" (id=${r.supplier_id})`,
    );
  }
} else {
  console.log("✗ NOT in supplier_contact.");
}

// 2. The B2B/company portal allowlist (separate).
const companyRows = (await sql`
  SELECT cc.id, cc.email, cc.name, cc.company_id, c.name AS company_name
  FROM company_contact cc
  JOIN company c ON c.id = cc.company_id
  WHERE cc.email = ${email}
`) as Array<{
  id: string;
  email: string;
  name: string | null;
  company_id: string;
  company_name: string;
}>;

if (companyRows.length > 0) {
  console.log("✓ Found in company_contact:");
  for (const r of companyRows) {
    console.log(
      `  • ${r.email} → company "${r.company_name}" (id=${r.company_id})`,
    );
  }
} else {
  console.log("✗ NOT in company_contact.");
}

// 3. The looser "contact_email" free-text field on the supplier row itself —
// this is display-only; it is NOT the magic-link allowlist. We surface it so
// admins who only filled this field see the discrepancy.
const supplierFreeText = (await sql`
  SELECT id, name, contact_email
  FROM supplier
  WHERE LOWER(COALESCE(contact_email, '')) = ${email}
`) as Array<{ id: string; name: string; contact_email: string | null }>;

if (supplierFreeText.length > 0) {
  console.log("\n⚠ Found in supplier.contact_email (display-only, NOT the");
  console.log("   magic-link allowlist):");
  for (const r of supplierFreeText) {
    console.log(`  • supplier "${r.name}" (id=${r.id})`);
  }
  if (supplierRows.length === 0) {
    console.log(
      "\n   Add this email under 'Supplier Logins' on the supplier detail page",
    );
    console.log("   to allow the supplier to sign in to the portal.");
  }
}

// 4. Does the user table already have a row for this address? (NextAuth
// creates one on the FIRST sign-in via `createUser`. Its presence means
// someone DID make it past the verification step at some point.)
const userRow = (await sql`
  SELECT id, email, role, supplier_id, company_id, "emailVerified"
  FROM "user"
  WHERE LOWER(email) = ${email}
  LIMIT 1
`) as Array<{
  id: string;
  email: string;
  role: string | null;
  supplier_id: string | null;
  company_id: string | null;
  emailVerified: Date | null;
}>;

if (userRow.length > 0) {
  const u = userRow[0];
  console.log(
    `\nℹ user row exists: role=${u.role ?? "(null)"} supplier_id=${
      u.supplier_id ?? "(null)"
    } company_id=${u.company_id ?? "(null)"} emailVerified=${
      u.emailVerified ? "yes" : "no"
    }`,
  );
} else {
  console.log("\nℹ No user row yet — this address has never completed sign-in.");
}

// Summary
console.log("");
const allowlistOk = supplierRows.length > 0 || companyRows.length > 0;
if (allowlistOk) {
  console.log(
    "→ Allowlist OK. If the link still didn't arrive, check Vercel function",
  );
  console.log("  logs for either:");
  console.log(
    "    'Magic sign-in link for <email>'  (RESEND_API_KEY unset → link logged",
  );
  console.log("                                      instead of sent),");
  console.log(
    "    or a Resend send-failure log line  (key set but send rejected — usually",
  );
  console.log(
    "                                       an EMAIL_FROM domain not verified",
  );
  console.log("                                       in Resend).");
} else {
  console.log(
    "→ Allowlist FAILED. The /supplier/login form would have silently dropped",
  );
  console.log(
    "  the request — the UI shows 'Check your email' regardless. Add this email",
  );
  console.log(
    "  under 'Supplier Logins' on the supplier detail page, then re-try the sign-in.",
  );
}
