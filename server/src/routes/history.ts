import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

const TrackSchema = z.object({
  userId:       z.string(),
  roomId:       z.string(),
  watchSeconds: z.number().min(0).max(86400).default(0),
});

// POST /api/history/track — upsert watch history (called periodically from the viewer page)
router.post('/track', async (req, res) => {
  try {
    const data = TrackSchema.parse(req.body);
    const stream = await prisma.stream.findUnique({ where: { roomId: data.roomId }, select: { id: true } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const entry = await prisma.watchHistory.upsert({
      where: { userId_streamId: { userId: data.userId, streamId: stream.id } },
      update: { watchSeconds: { increment: data.watchSeconds }, lastWatchedAt: new Date() },
      create: { userId: data.userId, streamId: stream.id, watchSeconds: data.watchSeconds },
    });
    res.json(entry);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[history/track]', err);
    res.status(500).json({ error: 'Failed to track watch history' });
  }
});

// GET /api/history/:userId — recently watched streams
router.get('/:userId', async (req, res) => {
  try {
    const history = await prisma.watchHistory.findMany({
      where: { userId: req.params.userId },
      include: {
        stream: {
          select: {
            roomId: true, title: true, thumbnailUrl: true, isLive: true, viewerCount: true,
            category: { select: { name: true, slug: true, icon: true } },
            user: { select: { id: true, name: true, username: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { lastWatchedAt: 'desc' },
      take: 24,
    });
    res.json({ history });
  } catch (err) {
    console.error('[history/:userId]', err);
    res.status(500).json({ error: 'Failed to fetch watch history' });
  }
});

export default router;
