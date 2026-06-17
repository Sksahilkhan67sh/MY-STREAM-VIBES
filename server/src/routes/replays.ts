/**
 * server/src/routes/replays.ts
 * Feature 4: Replay Library
 *
 * GET  /api/replays/:userId            — list all replays for a user
 * GET  /api/replays/stream/:roomId     — get replay for a specific stream
 * POST /api/replays/:roomId/meta       — update replay metadata
 * POST /api/replays/:roomId/publish    — make replay public
 * DELETE /api/replays/:roomId          — delete replay
 */

import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/replays/user/:userId — list all replays
router.get('/user/:userId', async (req, res) => {
  try {
    // Get all streams for this user that have recordings
    const streams = await prisma.stream.findMany({
      where: { userId: req.params.userId },
      include: {
        recordings: { orderBy: { createdAt: 'desc' } },
        thumbnails: { where: { isActive: true }, take: 1 },
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    const replays = await Promise.all(
      streams.flatMap(s => s.recordings.map(async (rec: any) => {
        let meta = null;
        try {
          meta = await (prisma as any).replayMeta.findUnique({ where: { recordingId: rec.id } });
        } catch { /* no meta yet */ }

        return {
          id: rec.id,
          streamId: s.id,
          roomId: s.roomId,
          streamTitle: s.title,
          thumbnailUrl: (s as any).thumbnails?.[0]?.url || s.thumbnailUrl || null,
          fileName: rec.fileName,
          filePath: rec.filePath,
          fileSize: rec.fileSize,
          durationSec: rec.durationSec || meta?.duration || 0,
          startedAt: rec.startedAt,
          endedAt: rec.endedAt,
          createdAt: rec.createdAt,
          isPublic: meta?.isPublic ?? false,
          title: meta?.title || s.title,
          description: meta?.description || null,
          tags: meta?.tags ? JSON.parse(meta.tags) : [],
          viewCount: meta?.viewCount ?? 0,
          metaId: meta?.id || null,
        };
      }))
    );

    res.json({ replays });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch replays' });
  }
});

// GET /api/replays/stream/:roomId
router.get('/stream/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({
      where: { roomId: req.params.roomId },
      include: { recordings: { orderBy: { createdAt: 'desc' } } },
    });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const recordings = await Promise.all(
      stream.recordings.map(async (rec: any) => {
        let meta = null;
        try { meta = await (prisma as any).replayMeta.findUnique({ where: { recordingId: rec.id } }); } catch { }
        return {
          ...rec,
          meta,
          title: meta?.title || stream.title,
          isPublic: meta?.isPublic ?? false,
          tags: meta?.tags ? JSON.parse(meta.tags) : [],
          viewCount: meta?.viewCount ?? 0,
        };
      })
    );

    res.json({ recordings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stream replays' });
  }
});

// POST /api/replays/:recordingId/meta — upsert metadata
router.post('/:recordingId/meta', async (req, res) => {
  try {
    const { hostToken, roomId, title, description, tags, isPublic, thumbnailUrl } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const meta = await (prisma as any).replayMeta.upsert({
      where: { recordingId: req.params.recordingId },
      update: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
        ...(isPublic !== undefined && { isPublic }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      },
      create: {
        recordingId: req.params.recordingId,
        title: title || stream.title,
        description: description || null,
        tags: tags ? JSON.stringify(tags) : '[]',
        isPublic: isPublic ?? false,
        thumbnailUrl: thumbnailUrl || null,
        duration: 0,
      },
    });

    res.json({ meta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update replay metadata' });
  }
});

// POST /api/replays/:recordingId/view — increment view count
router.post('/:recordingId/view', async (req, res) => {
  try {
    await (prisma as any).replayMeta.updateMany({
      where: { recordingId: req.params.recordingId },
      data: { viewCount: { increment: 1 } },
    });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // non-critical
  }
});

export default router;
