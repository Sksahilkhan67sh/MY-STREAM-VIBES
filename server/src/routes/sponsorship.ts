import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/sponsorship — browse marketplace
router.get('/', async (req, res) => {
  try {
    const { category, minBudget, page = '1', limit = '20' } = req.query as Record<string, string>;
    const where: any = { isActive: true };
    if (minBudget) where.minBudget = { gte: parseInt(minBudget) };

    const take = Math.min(parseInt(limit) || 20, 50);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const listings = await prisma.sponsorshipListing.findMany({
      where, orderBy: { audienceSize: 'desc' }, take, skip,
    });

    const creatorIds = listings.map(l => l.creatorId);
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true, username: true, avatarUrl: true, isVerified: true, verifiedTier: true,
        _count: { select: { followers: true } } },
    });
    const creatorMap = new Map(creators.map(c => [c.id, c]));

    res.json({
      listings: listings.map(l => ({
        ...l, categories: JSON.parse(l.categories),
        creator: creatorMap.get(l.creatorId),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

const ListingSchema = z.object({
  creatorId: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().max(1000),
  audienceSize: z.number().int().min(0).optional(),
  categories: z.array(z.string()).max(5).optional(),
  minBudget: z.number().int().min(0).optional(),
  currency: z.string().default('INR'),
  contactEmail: z.string().email().optional(),
});

// POST /api/sponsorship
router.post('/', async (req, res) => {
  try {
    const data = ListingSchema.parse(req.body);
    // Auto-populate audience size from follower count
    const followerCount = await prisma.follow.count({ where: { creatorId: data.creatorId } });
    const listing = await prisma.sponsorshipListing.create({
      data: {
        ...data,
        audienceSize: data.audienceSize ?? followerCount,
        categories: JSON.stringify(data.categories ?? []),
      },
    });
    res.json(listing);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

// PATCH /api/sponsorship/:id
router.patch('/:id', async (req, res) => {
  try {
    const data = ListingSchema.partial().parse(req.body);
    const updated = await prisma.sponsorshipListing.update({
      where: { id: req.params.id },
      data: { ...data, ...(data.categories ? { categories: JSON.stringify(data.categories) } : {}) },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// DELETE /api/sponsorship/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.sponsorshipListing.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ deactivated: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove listing' });
  }
});

// GET /api/sponsorship/creator/:creatorId — get own listing
router.get('/creator/:creatorId', async (req, res) => {
  try {
    const listing = await prisma.sponsorshipListing.findFirst({
      where: { creatorId: req.params.creatorId },
    });
    res.json(listing ?? null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

export default router;
