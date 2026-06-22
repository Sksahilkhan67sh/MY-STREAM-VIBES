-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: add_search_trigram
-- Type:      ADDITIVE ONLY — no drops, no data loss, fully reversible
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Enables PostgreSQL's pg_trgm extension and adds GIN trigram indexes on the
-- columns actually searched today (User.name, User.username, Stream.title,
-- Category.name). This is what makes typo-tolerant search ("sahill" finding
-- "sahil") both possible and fast — pg_trgm lets Postgres compute string
-- similarity directly in SQL via the `%` operator and similarity() function,
-- with the GIN index making that fast at scale instead of a full table scan.
--
-- pg_trgm is a standard, free PostgreSQL extension (not a paid add-on) and
-- is available on Neon and virtually every managed Postgres provider.
--
-- Tags are intentionally NOT trigram-indexed here: Stream.tags is stored as
-- a JSON-stringified array in a text column, and trigram-matching against
-- the raw JSON string (e.g. ["gaming","fps"]) would produce nonsensical
-- partial matches. Tag search is handled in application code instead (see
-- the updated /api/discover/search route), which parses the JSON and
-- matches individual tag values precisely.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_username_trgm_idx" ON "User" USING GIN ("username" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Stream_title_trgm_idx" ON "Stream" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual — run only if you need to revert this migration):
--
--   DROP INDEX IF EXISTS "User_name_trgm_idx";
--   DROP INDEX IF EXISTS "User_username_trgm_idx";
--   DROP INDEX IF EXISTS "Stream_title_trgm_idx";
--   DROP INDEX IF EXISTS "Category_name_trgm_idx";
--   DROP EXTENSION IF EXISTS pg_trgm;
--
-- Dropping the extension after its indexes are gone is safe and removes
-- nothing but the extension's own functions/operators — no user data,
-- streams, or any other table is touched by this rollback.
-- ═══════════════════════════════════════════════════════════════════════════
