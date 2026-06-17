/**
 * server/src/routes/clips.ts
 * Feature 7: Stream Clips / Highlights
 *
 * POST /api/clips/:roomId         — create a clip (mark start/end seconds)
 * GET  /api/clips/:roomId         — list clips for a stream
 * GET  /api/clips/all/:userId     — list all clips for a user
 * PATCH /api/clips/:clipId        — update clip title/status
 * DELETE /api/clips/:clipId       — delete a clip
 * POST /api/clips/:clipId/view    — increment view count
 */

import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// POST /api/clips/:roomId — create clip marker
router.post('/:roomId', async (req, res) => {
  try {
    const { hostToken, title, startSec, endSec, createdBy = 'host', thumbnailUrl } = req.body;
    if (startSec === undefined || endSec === undefined) {
      return res.status(400).json({ error: 'startSec and endSec required' });
    }
    if (endSec <= startSec) {
      return res.status(400).json({ error: 'endSec must be after startSec' });
    }
    if (endSec - startSec > 300) {
      return res.status(400).json({ error: 'Clip cannot exceed 5 minutes' });
    }

    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (hostToken && stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const clip = await (prisma as any).streamClip.create({
      data: {
        streamId: stream.id,
        title: title || `Clip at ${formatSec(startSec)}`,
        startSec,
        endSec,
        thumbnailUrl: thumbnailUrl || null,
        status: 'pending',
        createdBy,
      },
    });

    res.json({ clip });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create clip' });
  }
});

// GET /api/clips/:roomId — list all clips for a stream
router.get('/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const clips = await (prisma as any).streamClip.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ clips: clips.map((c: any) => ({
      ...c,
      durationSec: Math.round(c.endSec - c.startSec),
      startFormatted: formatSec(c.startSec),
      endFormatted: formatSec(c.endSec),
    })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clips' });
  }
});

// GET /api/clips/user/:userId — all clips for a user across all streams
router.get('/user/:userId', async (req, res) => {
  try {
    const streams = await prisma.stream.findMany({
      where: { userId: req.params.userId },
      select: { id: true, roomId: true, title: true, thumbnailUrl: true },
    });
    const streamIds = streams.map(s => s.id);
    const streamMap = Object.fromEntries(streams.map(s => [s.id, s]));

    const clips = await (prisma as any).streamClip.findMany({
      where: { streamId: { in: streamIds } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      clips: clips.map((c: any) => ({
        ...c,
        stream: streamMap[c.streamId] || null,
        durationSec: Math.round(c.endSec - c.startSec),
        startFormatted: formatSec(c.startSec),
        endFormatted: formatSec(c.endSec),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user clips' });
  }
});

// PATCH /api/clips/:clipId — update title, url, status
router.patch('/:clipId', async (req, res) => {
  try {
    const { title, url, status, thumbnailUrl } = req.body;
    const clip = await (prisma as any).streamClip.update({
      where: { id: req.params.clipId },
      data: {
        ...(title !== undefined && { title }),
        ...(url !== undefined && { url }),
        ...(status !== undefined && { status }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      },
    });
    res.json({ clip });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update clip' });
  }
});

// DELETE /api/clips/:clipId
router.delete('/:clipId', async (req, res) => {
  try {
    const { hostToken } = req.body;
    const clip = await (prisma as any).streamClip.findUnique({
      where: { id: req.params.clipId },
      include: { stream: { select: { hostToken: true } } },
    });
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    if (hostToken && clip.stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    await (prisma as any).streamClip.delete({ where: { id: req.params.clipId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete clip' });
  }
});

// POST /api/clips/:clipId/view
router.post('/:clipId/view', async (req, res) => {
  try {
    await (prisma as any).streamClip.update({
      where: { id: req.params.clipId },
      data: { viewCount: { increment: 1 } },
    });
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export default router;
