-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: add_stream_wizard
-- Type:      ADDITIVE ONLY — no drops, no data loss, fully reversible
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add nullable wizardPrefs column to Stream (stores the creator's Step
--    2/3/4 toggle choices as JSON text). Nullable, no default required,
--    existing rows simply get NULL — every consumer treats NULL as "no
--    preferences set" / "all off", so no existing stream is affected.
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "wizardPrefs" TEXT;

-- 2. Create StreamWizardDraft — a brand new table, one row per creator,
--    used purely for autosaving in-progress wizard state before a real
--    Stream row exists. Creating a new table never touches existing data.
CREATE TABLE IF NOT EXISTS "StreamWizardDraft" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "data"      TEXT NOT NULL,
    "step"      INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamWizardDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StreamWizardDraft_userId_key" ON "StreamWizardDraft"("userId");
CREATE INDEX IF NOT EXISTS "StreamWizardDraft_userId_idx" ON "StreamWizardDraft"("userId");

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual — run only if you need to revert this migration):
--
--   DROP TABLE IF EXISTS "StreamWizardDraft";
--   ALTER TABLE "Stream" DROP COLUMN IF EXISTS "wizardPrefs";
--
-- This rollback only removes what this migration added. No streams, users,
-- payments, donations, or analytics rows are touched.
-- ═══════════════════════════════════════════════════════════════════════════
