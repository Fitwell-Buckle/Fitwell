-- Drop the orphaned tradeshow entity (replaced in the UI by lead.meeting_date).
-- Hand-ordered + IF EXISTS so it's safe and idempotent: drop the FK and index
-- first, then the column, then the table. (drizzle-kit's default output dropped
-- the table CASCADE first, which removed the FK, then failed re-dropping it.)
ALTER TABLE "lead" DROP CONSTRAINT IF EXISTS "lead_tradeshow_id_tradeshow_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "lead_tradeshow_id_idx";--> statement-breakpoint
ALTER TABLE "lead" DROP COLUMN IF EXISTS "tradeshow_id";--> statement-breakpoint
DROP TABLE IF EXISTS "tradeshow";
