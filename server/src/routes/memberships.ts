import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/memberships/tiers/:creatorId
router.get('/tiers/:creatorId', async (req, res) => {
  try {
    const { viewerId } = req.query as Record<string, string>;
    const tiers = await prisma.membershipTier.findMany({
      where: { creatorId: req.params.creatorId, isActive: true },
      include: { _count: { select: { memberships: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    let activeTierIds = new Set<string>();
    if (viewerId) {
      const active = await prisma.membership.findMany({
        where: { userId: viewerId, tierId: { in: tiers.map(t => t.id) }, status: 'active' },
        select: { tierId: true },
      });
      activeTierIds = new Set(active.map(m => m.tierId));
    }
    res.json({
      tiers: tiers.map(t => ({
        ...t,
        perks: JSON.parse(t.perks),
        memberCount: t._count.memberships,
        isActive: activeTierIds.has(t.id),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tiers' });
  }
});

const TierSchema = z.object({
  creatorId: z.string(),
  name: z.string().min(1).max(40),
  description: z.string().max(200).optional(),
  price: z.number().int().min(0),
  currency: z.string().default('INR'),
  color: z.string().optional(),
  perks: z.array(z.string()).max(10).optional(),
  sortOrder: z.number().optional(),
});

// POST /api/memberships/tiers
router.post('/tiers', async (req, res) => {
  try {
    const data = TierSchema.parse(req.body);
    const tier = await prisma.membershipTier.create({
      data: {
        creatorId: data.creatorId,
        name: data.name,
        description: data.description,
        price: data.price,
        currency: data.currency,
        sortOrder: data.sortOrder,
        perks: JSON.stringify(data.perks ?? []),
        color: data.color ?? '#6366f1',
      },
    });
    res.json(tier);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create tier' });
  }
});

// PATCH /api/memberships/tiers/:id
router.patch('/tiers/:id', async (req, res) => {
  try {
    const data = TierSchema.partial().parse(req.body);
    const updated = await prisma.membershipTier.update({
      where: { id: req.params.id },
      data: { ...data, perks: data.perks !== undefined ? JSON.stringify(data.perks) : undefined },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tier' });
  }
});

// DELETE /api/memberships/tiers/:id
router.delete('/tiers/:id', async (req, res) => {
  try {
    await prisma.membershipTier.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ deactivated: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate tier' });
  }
});

// POST /api/memberships/subscribe — mock subscription (no payment gateway)
router.post('/subscribe', async (req, res) => {
  try {
    const { userId, tierId } = z.object({ userId: z.string(), tierId: z.string() }).parse(req.body);
    const tier = await prisma.membershipTier.findUnique({ where: { id: tierId } });
    if (!tier) return res.status(404).json({ error: 'Tier not found' });

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    const renewsAt = new Date(expiresAt);

    const membership = await prisma.membership.upsert({
      where: { userId_tierId: { userId, tierId } },
      update: { status: 'active', expiresAt, renewsAt },
      create: { userId, tierId, status: 'active', expiresAt, renewsAt },
    });

    // Notify the creator
    await prisma.notification.create({
      data: {
        userId: tier.creatorId, type: 'membership',
        title: 'New member!', body: `Someone joined your ${tier.name} tier`,
        actionUrl: `/studio`,
      },
    });

    res.json(membership);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// DELETE /api/memberships/cancel
router.delete('/cancel', async (req, res) => {
  try {
    const { userId, tierId } = z.object({ userId: z.string(), tierId: z.string() }).parse(req.body);
    await prisma.membership.updateMany({ where: { userId, tierId }, data: { status: 'cancelled' } });
    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel' });
  }
});

// GET /api/memberships/user/:userId — all active memberships for a viewer
router.get('/user/:userId', async (req, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.params.userId, status: 'active' },
      include: { tier: true },
    });

    // MembershipTier.creatorId is a plain string (no Prisma relation defined
    // on that model to User), so the creator's display info is fetched in a
    // second query rather than via a nested include.
    const creatorIds = [...new Set(memberships.map(m => m.tier.creatorId))];
    const creators = creatorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: {
            id: true, name: true, username: true, avatarUrl: true,
            streams: { where: { isLive: true, isPublic: true }, select: { roomId: true }, take: 1 },
          },
        })
      : [];
    const creatorById = new Map(creators.map(c => [c.id, c]));

    res.json({
      memberships: memberships.map(m => {
        const creator = creatorById.get(m.tier.creatorId);
        return {
          ...m,
          tier: { ...m.tier, perks: JSON.parse(m.tier.perks) },
          creator: creator
            ? {
                id: creator.id, name: creator.name, username: creator.username, avatarUrl: creator.avatarUrl,
                isLive: creator.streams.length > 0,
                liveRoomId: creator.streams[0]?.roomId || null,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch memberships' });
  }
});

export default router;
