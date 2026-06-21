-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: add_viewer_settings
-- Type:      ADDITIVE ONLY — no drops, no data loss, fully reversible
-- ═══════════════════════════════════════════════════════════════════════════

-- Adds three nullable-default boolean columns to User for the new viewer
-- Settings page (privacy + notification preferences). Every default exactly
-- matches today's existing behavior (nothing was private, all notifications
-- were always sent), so every existing row is unaffected until a user
-- explicitly changes a setting.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profilePrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailNotifsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pushNotifsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual — run only if you need to revert this migration):
--
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "profilePrivate";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "emailNotifsEnabled";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "pushNotifsEnabled";
--
-- This rollback only removes what this migration added. No user accounts,
-- streams, or any other data is touched.
-- ═══════════════════════════════════════════════════════════════════════════
