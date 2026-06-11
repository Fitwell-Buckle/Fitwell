-- Idempotent: prod + dev already have this column (applied earlier under a
-- migration that was renumbered after a 0057 collision with concurrent work),
-- so IF NOT EXISTS makes re-applying a safe no-op while still adding it on
-- any fresh database.
ALTER TABLE "production_comment" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;