/**
 * One-off: provision the assistant's read-only role on the CURRENT database
 * (whatever DATABASE_URL points at) and emit the read-only connection string.
 * Idempotent; safe to re-run.
 *
 * Dev (writes DATABASE_URL_READONLY into .env.local):
 *   node --env-file=.env.local --import tsx/esm scripts/setup-readonly-role.ts
 *
 * Prod (writes the RO connection string to a file, to pipe into Vercel env):
 *   node --env-file=.env.production.local --import tsx/esm \
 *     scripts/setup-readonly-role.ts --out /tmp/ro.url
 *
 * Never prints the password or connection string.
 */
import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// Optional `--out <file>`: write the RO connection string to <file> (mode 0600)
// instead of touching .env.local. Used for the production flow.
const outIdx = process.argv.indexOf("--out");
const outFile = outIdx !== -1 ? process.argv[outIdx + 1] : null;

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_URL is not set (run with --env-file=.env.local).");
  process.exit(1);
}

const ROLE = "fitwell_assistant_ro";
const password = crypto.randomBytes(24).toString("base64url");
const admin = neon(adminUrl, { fullResults: true });

async function run(
  label: string,
  sql: string,
  opts: { ignore?: boolean } = {},
): Promise<void> {
  try {
    await admin(sql);
    console.log("  ok   ", label);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0];
    if (opts.ignore) {
      console.log("  skip ", label, "—", msg);
    } else {
      console.error("  FAIL ", label, "—", msg);
      throw e;
    }
  }
}

async function main(): Promise<void> {
  console.log(`Provisioning read-only role '${ROLE}' on the current branch…`);

  await run(
    "create role (if absent)",
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
         CREATE ROLE ${ROLE} WITH LOGIN PASSWORD '${password}';
       END IF;
     END $$;`,
  );
  // Reset the password every run so the URL we write always matches.
  await run("set password", `ALTER ROLE ${ROLE} WITH LOGIN PASSWORD '${password}'`);
  await run("statement_timeout", `ALTER ROLE ${ROLE} SET statement_timeout = '8000ms'`);
  await run("grant usage on schema", `GRANT USAGE ON SCHEMA public TO ${ROLE}`);
  await run("grant select (all tables)", `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
  await run(
    "default privileges (future tables)",
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${ROLE}`,
  );

  // Deny auth secret-bearing tables (ignore if a table doesn't exist here).
  for (const t of ["account", "session", '"verificationToken"', "authenticator"]) {
    await run(`revoke ${t}`, `REVOKE ALL ON TABLE ${t} FROM ${ROLE}`, { ignore: true });
  }

  // Build the read-only connection string (same host/db, swapped credentials).
  const u = new URL(adminUrl!);
  u.username = ROLE;
  u.password = password;
  const roUrl = u.toString();

  // Smoke test: a read works…
  console.log("Smoke test…");
  const ro = neon(roUrl, { fullResults: true });
  const tables = (await ro(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
  )) as unknown as { rows: { n: number }[] };
  console.log("  ok    read works — sees", tables.rows[0].n, "tables");

  // …and a write is denied.
  let writeDenied = false;
  try {
    await ro(`CREATE TABLE _assistant_probe (id int)`);
  } catch {
    writeDenied = true;
  }
  if (!writeDenied) {
    console.error("  FAIL  a WRITE was allowed — role is not read-only. Aborting.");
    process.exit(2);
  }
  console.log("  ok    write correctly denied (read-only confirmed)");

  if (outFile) {
    // Prod flow: write the connection string to a file for piping into Vercel.
    writeFileSync(outFile, roUrl, { mode: 0o600 });
    console.log(`\nWrote read-only connection string to ${outFile}.`);
  } else {
    // Dev flow: wire DATABASE_URL_READONLY into .env.local (replace if present).
    let env = readFileSync(".env.local", "utf8");
    const line = `DATABASE_URL_READONLY=${roUrl}`;
    if (/^DATABASE_URL_READONLY=.*$/m.test(env)) {
      env = env.replace(/^DATABASE_URL_READONLY=.*$/m, line);
      console.log("Updated DATABASE_URL_READONLY in .env.local");
    } else {
      env = env.replace(/\n*$/, `\n${line}\n`);
      console.log("Added DATABASE_URL_READONLY to .env.local");
    }
    writeFileSync(".env.local", env);
    console.log("\nDone. The assistant can now run read-only queries locally.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
