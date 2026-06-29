-- ============================================================================
-- Read-only Postgres role for the Portal AI Assistant
-- ============================================================================
--
-- The assistant runs model-generated SQL. This role is the hard guarantee that
-- it can only ever READ: it is granted SELECT on business tables and nothing
-- else (no INSERT/UPDATE/DELETE/DDL), and is explicitly denied the NextAuth
-- secret-bearing tables so the agent can never surface session/access tokens.
--
-- Apply order:
--   1. Dev:  run against your personal Neon dev branch, then put the resulting
--            connection string in .env.local as DATABASE_URL_READONLY.
--   2. Prod: Greg applies this to the production Neon branch (engineering-owner
--            sign-off), and DATABASE_URL_READONLY is added to Vercel env.
--
-- Replace <STRONG_PASSWORD> before running. The connection string is your
-- existing DATABASE_URL with the user/password swapped to this role.
-- ============================================================================

-- 1. The role: can log in, nothing inherited.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitwell_assistant_ro') THEN
    CREATE ROLE fitwell_assistant_ro WITH LOGIN PASSWORD '<STRONG_PASSWORD>';
  END IF;
END $$;

-- 2. A short statement timeout baked into every connection this role opens,
--    so a runaway query can't hammer the database. (Belt to the app's LIMIT.)
ALTER ROLE fitwell_assistant_ro SET statement_timeout = '8000ms';

-- 3. Read access to the schema + all current and future tables.
GRANT USAGE ON SCHEMA public TO fitwell_assistant_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fitwell_assistant_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO fitwell_assistant_ro;

-- 4. Revoke the auth secret-bearing tables. The app filters these too, but the
--    grant is the real lock. (If a table doesn't exist on your branch yet, the
--    REVOKE is a harmless no-op error — adjust to your schema.)
REVOKE ALL ON TABLE account FROM fitwell_assistant_ro;
REVOKE ALL ON TABLE session FROM fitwell_assistant_ro;
REVOKE ALL ON TABLE "verificationToken" FROM fitwell_assistant_ro;
-- Add others here if any table stores secrets/PII you don't want queryable.

-- 5. Sanity: this role must NOT be able to write. The following would error if
--    you tried it as fitwell_assistant_ro:
--      INSERT INTO "order" (id) VALUES ('x');  -- permission denied
-- ============================================================================
