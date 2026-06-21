import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

/**
 * Role system API — additive, does not touch any existing route.
 *
 * GET    /api/users/:id/role         → { role, roleSelectedAt }
 * POST   /api/users/:id/role         → set role during onboarding (VIEWER|CREATOR only)
 * POST   /api/users/become-creator   → upgrade VIEWER → CREATOR (no data loss, no logout)
 *
 * Note: userId here may be an OAuth `sub` (cuid-like) or an email, mirroring
 * the existing lazy-user-creation pattern already used in routes/streams.ts.
 */

async function resolveUser(idOrEmail: string) {
  const isEmail = idOrEmail.includes('@');
  if (isEmail) {
    return prisma.user.upsert({
      where: { email: idOrEmail },
      update: {},
      create: { email: idOrEmail },
    });
  }
  const existing = await prisma.user.findUnique({ where: { id: idOrEmail } });
  if (existing) return existing;
  // Row was wiped or never created — recreate with placeholder email (same
  // pattern already used in routes/streams.ts to avoid FK errors).
  return prisma.user.create({
    data: { id: idOrEmail, email: `${idOrEmail}@placeholder.local` },
  });
}

// GET /api/users/:id/role
router.get('/:id/role', async (req, res) => {
  try {
    const user = await resolveUser(req.params.id);

    // hasChannel: true once a channel handle (username) is set via the
    // /create-channel wizard. IMPORTANT — for backward compatibility with
    // creators who existed before this wizard existed (and were promoted to
    // CREATOR by the role-system migration's backfill), we also treat any
    // pre-existing creator footprint as already having a "channel", using
    // the exact same criteria the migration backfill used. This guarantees
    // no existing creator is ever newly locked out of /studio for lacking
    // a username they were never asked to set.
    let hasChannel = !!user.username;
    if (!hasChannel && (user.role === 'CREATOR' || user.role === 'ADMIN')) {
      const [streamCount, verification, tier, merch, sponsorship] = await Promise.all([
        prisma.stream.count({ where: { userId: user.id } }),
        prisma.creatorVerification.findUnique({ where: { userId: user.id } }),
        prisma.membershipTier.findFirst({ where: { creatorId: user.id } }),
        prisma.merchProduct.findFirst({ where: { creatorId: user.id } }),
        prisma.sponsorshipListing.findFirst({ where: { creatorId: user.id } }),
      ]);
      hasChannel = streamCount > 0 || !!verification || !!tier || !!merch || !!sponsorship;
    }

    res.json({
      id: user.id,
      role: user.role,
      roleSelectedAt: user.roleSelectedAt,
      hasSelectedRole: !!user.roleSelectedAt,
      // Additive fields — let clients know whether a creator channel has been
      // set up yet. Does not change any existing field already returned here.
      username: user.username,
      hasChannel,
    });
  } catch (err) {
    console.error('GET /users/:id/role error:', err);
    res.status(500).json({ error: 'Failed to fetch role' });
  }
});

const usernamePattern = /^[a-zA-Z0-9_]+$/;

// GET /api/users/check-username/:username — live availability check used by
// the /create-channel wizard. Mounted before any other param routes that
// could collide; "check-username" can never be a valid :id/role lookup since
// this route lives at a separate path segment.
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { userId } = req.query as Record<string, string | undefined>;

    if (username.length < 3 || username.length > 30 || !usernamePattern.test(username)) {
      return res.json({ available: false, reason: 'invalid' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    const available = !existing || (!!userId && existing.id === userId);
    res.json({ available, reason: available ? null : 'taken' });
  } catch (err) {
    console.error('GET /users/check-username error:', err);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

const SetRoleSchema = z.object({
  role: z.enum(['VIEWER', 'CREATOR']), // onboarding never sets ADMIN
});

// POST /api/users/:id/role  — used by onboarding screen
router.post('/:id/role', async (req, res) => {
  try {
    const { role } = SetRoleSchema.parse(req.body);
    const user = await resolveUser(req.params.id);

    // ADMIN accounts are never downgraded by onboarding
    if (user.role === 'ADMIN') {
      return res.json({ id: user.id, role: user.role, roleSelectedAt: user.roleSelectedAt });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role, roleSelectedAt: new Date() },
    });
    res.json({ id: updated.id, role: updated.role, roleSelectedAt: updated.roleSelectedAt });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ error: 'Invalid role', details: err.issues });
    console.error('POST /users/:id/role error:', err);
    res.status(500).json({ error: 'Failed to set role' });
  }
});

const BecomeCreatorSchema = z.object({
  userId: z.string().min(1),
});

// POST /api/users/become-creator — VIEWER → CREATOR, no new account, no data loss
router.post('/become-creator', async (req, res) => {
  try {
    const { userId } = BecomeCreatorSchema.parse(req.body);
    const user = await resolveUser(userId);

    if (user.role === 'CREATOR' || user.role === 'ADMIN') {
      return res.json({ id: user.id, role: user.role, alreadyCreator: true });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'CREATOR', roleSelectedAt: user.roleSelectedAt ?? new Date() },
    });
    res.json({ id: updated.id, role: updated.role, alreadyCreator: false });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ error: 'Invalid request', details: err.issues });
    console.error('POST /users/become-creator error:', err);
    res.status(500).json({ error: 'Failed to upgrade to creator' });
  }
});

// ── Viewer Settings (account info + privacy + notification preferences) ────
// Additive — new fields only, default values preserve today's exact
// behavior for every existing user until they explicitly change something.

// GET /api/users/:id/settings
router.get('/:id/settings', async (req, res) => {
  try {
    const user = await resolveUser(req.params.id);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      profilePrivate: user.profilePrivate,
      emailNotifsEnabled: user.emailNotifsEnabled,
      pushNotifsEnabled: user.pushNotifsEnabled,
    });
  } catch (err) {
    console.error('GET /users/:id/settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

const UpdateSettingsSchema = z.object({
  profilePrivate: z.boolean().optional(),
  emailNotifsEnabled: z.boolean().optional(),
  pushNotifsEnabled: z.boolean().optional(),
});

// PATCH /api/users/:id/settings
router.patch('/:id/settings', async (req, res) => {
  try {
    const data = UpdateSettingsSchema.parse(req.body);
    const user = await resolveUser(req.params.id);
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    res.json({
      profilePrivate: updated.profilePrivate,
      emailNotifsEnabled: updated.emailNotifsEnabled,
      pushNotifsEnabled: updated.pushNotifsEnabled,
    });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ error: 'Invalid request', details: err.issues });
    console.error('PATCH /users/:id/settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
