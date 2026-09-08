import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/verification/:userId
router.get('/:userId', async (req, res) => {
  try {
    const v = await prisma.creatorVerification.findUnique({ where: { userId: req.params.userId } });
    res.json(v ?? { status: 'none' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch verification' });
  }
});

const ApplySchema = z.object({
  userId: z.string(),
  documentUrl: z.string().url().optional(),
});

// POST /api/verification/apply — submit for verification
router.post('/apply', async (req, res) => {
  try {
    const data = ApplySchema.parse(req.body);
    const followerCount = await prisma.follow.count({ where: { creatorId: data.userId } });
    const v = await prisma.creatorVerification.upsert({
      where:  { userId: data.userId },
      update: { status: 'pending', submittedAt: new Date(), documentUrl: data.documentUrl ?? null, followerCountAtSubmission: followerCount },
      create: { userId: data.userId, status: 'pending', documentUrl: data.documentUrl ?? null, followerCountAtSubmission: followerCount },
    });
    res.json(v);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to apply' });
  }
});

// PATCH /api/verification/:userId/review — admin approve/reject
router.patch('/:userId/review', async (req, res) => {
  try {
    // SECURITY: this route had NO admin check at all — any caller could
    // grant/revoke any user's verified status and tier. This is a partial
    // mitigation, not a full fix: it requires the caller to name an
    // adminUserId and verifies that user actually has role: ADMIN in the
    // database, which meaningfully raises the bar (an attacker now needs
    // to know/guess a real admin's user id) but does NOT prove the
    // request genuinely came from that admin, since this API has no
    // session verification of its own yet — see PR description.
    const { adminUserId, status, tier, reviewNote } = z.object({
      adminUserId: z.string(),
      status: z.enum(['approved', 'rejected']),
      tier: z.enum(['standard', 'trusted', 'partner']).optional(),
      reviewNote: z.string().optional(),
    }).parse(req.body);

    const admin = await prisma.user.findUnique({ where: { id: adminUserId }, select: { role: true } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const v = await prisma.creatorVerification.update({
      where: { userId: req.params.userId },
      data: { status, tier: tier ?? 'standard', reviewedAt: new Date(), reviewNote },
    });

    if (status === 'approved') {
      await prisma.user.update({
        where: { id: req.params.userId },
        data: { isVerified: true, verifiedTier: tier ?? 'standard' },
      });
    }

    res.json(v);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to review' });
  }
});

export default router;
