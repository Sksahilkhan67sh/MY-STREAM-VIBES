-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: add_user_role_system
-- Type:      ADDITIVE ONLY — no drops, no data loss, fully reversible
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create the UserRole enum
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'CREATOR', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add nullable-safe role column with default VIEWER (does not lock table for long / no data loss)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'VIEWER';

-- 3. Add roleSelectedAt column (nullable — tracks when onboarding choice was made)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleSelectedAt" TIMESTAMP(3);

-- 4. Index for fast role-based filtering
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. BACKFILL: promote existing users with creator activity to CREATOR
--    Criteria: has at least one Stream, OR a CreatorVerification record,
--    OR a MembershipTier, OR a MerchProduct, OR a SponsorshipListing.
--    Everyone else stays VIEWER (the default already applied above).
--    This step is idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "User" u
SET "role" = 'CREATOR'
WHERE u."role" = 'VIEWER'
  AND (
    EXISTS (SELECT 1 FROM "Stream" s WHERE s."userId" = u.id)
    OR EXISTS (SELECT 1 FROM "CreatorVerification" cv WHERE cv."userId" = u.id)
    OR EXISTS (SELECT 1 FROM "MembershipTier" mt WHERE mt."creatorId" = u.id)
    OR EXISTS (SELECT 1 FROM "MerchProduct" mp WHERE mp."creatorId" = u.id)
    OR EXISTS (SELECT 1 FROM "SponsorshipListing" sl WHERE sl."creatorId" = u.id)
  );

-- Mark backfilled users as having an implicit role selection timestamp
-- (so onboarding doesn't re-prompt existing creators)
UPDATE "User"
SET "roleSelectedAt" = COALESCE("roleSelectedAt", "createdAt")
WHERE "role" = 'CREATOR' AND "roleSelectedAt" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual — run only if you need to revert this migration):
--
--   DROP INDEX IF EXISTS "User_role_idx";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "roleSelectedAt";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
--   DROP TYPE IF EXISTS "UserRole";
--
-- This rollback is non-destructive to any OTHER data — only removes the
-- columns/type added by this migration. No streams, users, payments, or
-- analytics rows are touched.
-- ═══════════════════════════════════════════════════════════════════════════
