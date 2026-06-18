import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

function fmtSec(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

// POST /api/clips/:roomId
router.post('/:roomId', async (req, res) => {
  try {
    const { hostToken, title, startSec, endSec, createdBy = 'host' } = req.body;
    if (startSec === undefined || endSec === undefined) return res.status(400).json({ error: 'startSec and endSec required' });
    if (endSec <= startSec) return res.status(400).json({ error: 'endSec must be after startSec' });
    if (endSec - startSec > 300) return res.status(400).json({ error: 'Clip cannot exceed 5 minutes' });

    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (hostToken && stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const clip = await prisma.streamClip.create({
      data: {
        streamId:  stream.id,
        title:     title || `Clip at ${fmtSec(startSec)}`,
        startSec,
        endSec,
        status:    'pending',
        createdBy,
      },
    });
    res.json({ clip });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create clip' }); }
});

// GET /api/clips/:roomId
router.get('/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const clips = await prisma.streamClip.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ clips: clips.map(c => ({
      ...c,
      durationSec:    Math.round(c.endSec - c.startSec),
      startFormatted: fmtSec(c.startSec),
      endFormatted:   fmtSec(c.endSec),
    })) });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch clips' }); }
});

// GET /api/clips/user/:userId
router.get('/user/:userId', async (req, res) => {
  try {
    const streams = await prisma.stream.findMany({
      where: { userId: req.params.userId },
      select: { id: true, roomId: true, title: true, thumbnailUrl: true },
    });
    const streamIds = streams.map(s => s.id);
    const streamMap = Object.fromEntries(streams.map(s => [s.id, s]));
    const clips = await prisma.streamClip.findMany({
      where: { streamId: { in: streamIds } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ clips: clips.map(c => ({
      ...c,
      stream:         streamMap[c.streamId] || null,
      durationSec:    Math.round(c.endSec - c.startSec),
      startFormatted: fmtSec(c.startSec),
      endFormatted:   fmtSec(c.endSec),
    })) });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch user clips' }); }
});

// PATCH /api/clips/:clipId
router.patch('/:clipId', async (req, res) => {
  try {
    const { title, url, status, thumbnailUrl } = req.body;
    const clip = await prisma.streamClip.update({
      where: { id: req.params.clipId },
      data: {
        ...(title        !== undefined && { title }),
        ...(url          !== undefined && { url }),
        ...(status       !== undefined && { status }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      },
    });
    res.json({ clip });
  } catch (err) { res.status(500).json({ error: 'Failed to update clip' }); }
});

// DELETE /api/clips/:clipId
router.delete('/:clipId', async (req, res) => {
  try {
    await prisma.streamClip.delete({ where: { id: req.params.clipId } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete clip' }); }
});

// POST /api/clips/:clipId/view
router.post('/:clipId/view', async (req, res) => {
  try {
    await prisma.streamClip.update({ where: { id: req.params.clipId }, data: { viewCount: { increment: 1 } } });
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

export default router;
