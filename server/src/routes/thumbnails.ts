import { Router } from 'express';
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

    // Deactivate old thumbnails
    await prisma.streamThumbnail.updateMany({
      where: { streamId: stream.id },
      data: { isActive: false },
    });

    const thumbnail = await prisma.streamThumbnail.create({
      data: { streamId: stream.id, url, source, isActive: true },
    });

    // Store on Stream for quick access in viewer/list pages
    await prisma.stream.update({
      where: { id: stream.id },
      data: { thumbnailUrl: url },
    });

    res.json(thumbnail);
  } catch (err) {
    console.error('[thumbnails POST]', err);
    res.status(500).json({ error: 'Failed to save thumbnail' });
  }
});

// GET /api/thumbnails/:roomId
router.get('/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const thumbnails = await prisma.streamThumbnail.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ thumbnails, active: thumbnails.find(t => t.isActive) ?? null });
  } catch (err) {
    console.error('[thumbnails GET]', err);
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

    await prisma.streamThumbnail.delete({ where: { id: req.params.thumbnailId } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[thumbnails DELETE]', err);
    res.status(500).json({ error: 'Failed to delete thumbnail' });
  }
});

export default router;
