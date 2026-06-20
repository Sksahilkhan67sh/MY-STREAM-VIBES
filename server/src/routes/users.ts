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
    res.json({
      id: user.id,
      role: user.role,
      roleSelectedAt: user.roleSelectedAt,
      hasSelectedRole: !!user.roleSelectedAt,
    });
  } catch (err) {
    console.error('GET /users/:id/role error:', err);
    res.status(500).json({ error: 'Failed to fetch role' });
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

export default router;
