import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/ratings/:streamId — get ratings + average for a stream
router.get('/:streamId', async (req, res) => {
  try {
    const [ratings, agg] = await Promise.all([
      prisma.streamRating.findMany({
        where: { streamId: req.params.streamId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          // We can't include user directly since StreamRating has no user relation model
          // so we do a manual join below
        },
      }),
      prisma.streamRating.aggregate({
        where: { streamId: req.params.streamId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);
    res.json({
      ratings,
      average: agg._avg.rating ?? 0,
      count: agg._count.rating,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

const RatingSchema = z.object({
  streamId: z.string(),
  userId:   z.string(),
  rating:   z.number().int().min(1).max(5),
  review:   z.string().max(500).optional(),
});

// POST /api/ratings
router.post('/', async (req, res) => {
  try {
    const data = RatingSchema.parse(req.body);
    const saved = await prisma.streamRating.upsert({
      where: { streamId_userId: { streamId: data.streamId, userId: data.userId } },
      update: { rating: data.rating, review: data.review },
      create: data as any,
    });
    res.json(saved);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// DELETE /api/ratings
router.delete('/', async (req, res) => {
  try {
    const { streamId, userId } = z.object({ streamId: z.string(), userId: z.string() }).parse(req.body);
    await prisma.streamRating.deleteMany({ where: { streamId, userId } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete rating' });
  }
});

export default router;
