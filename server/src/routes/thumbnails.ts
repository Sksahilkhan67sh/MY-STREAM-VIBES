/**
 * server/src/routes/thumbnails.ts
 * Feature 2: Stream Thumbnails
 *
 * POST /api/thumbnails/:roomId          — save a thumbnail URL for a stream
 * GET  /api/thumbnails/:roomId          — get active thumbnail
 * DELETE /api/thumbnails/:roomId/:id   — remove a thumbnail
 */

import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// POST /api/thumbnails/:roomId
router.post('/:roomId', async (req, res) => {
  try {
    const { hostToken, url, source = 'upload' } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    // Deactivate previous thumbnails
    await (prisma as any).streamThumbnail.updateMany({
      where: { streamId: stream.id },
      data: { isActive: false },
    });

    const thumbnail = await (prisma as any).streamThumbnail.create({
      data: { streamId: stream.id, url, source, isActive: true },
    });

    // Also store on stream for quick access
    await prisma.stream.update({
      where: { id: stream.id },
      data: { thumbnailUrl: url },
    });

    res.json(thumbnail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save thumbnail' });
  }
});

// GET /api/thumbnails/:roomId
router.get('/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const thumbnails = await (prisma as any).streamThumbnail.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ thumbnails, active: thumbnails.find((t: any) => t.isActive) || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get thumbnails' });
  }
});

// DELETE /api/thumbnails/:roomId/:thumbnailId
router.delete('/:roomId/:thumbnailId', async (req, res) => {
  try {
    const { hostToken } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    await (prisma as any).streamThumbnail.delete({ where: { id: req.params.thumbnailId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete thumbnail' });
  }
});

export default router;
