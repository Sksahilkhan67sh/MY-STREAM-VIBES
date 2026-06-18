import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/replays/user/:userId
router.get('/user/:userId', async (req, res) => {
  try {
    const streams = await prisma.stream.findMany({
      where: { userId: req.params.userId },
      include: { recordings: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });

    const replays = await Promise.all(
      streams.flatMap(s =>
        s.recordings.map(async (rec) => {
          let meta: any = null;
          try { meta = await prisma.replayMeta.findUnique({ where: { recordingId: rec.id } }); } catch {}
          return {
            id:          rec.id,
            streamId:    s.id,
            roomId:      s.roomId,
            streamTitle: s.title,
            thumbnailUrl: meta?.thumbnailUrl || s.thumbnailUrl || null,
            fileName:    rec.fileName,
            filePath:    rec.filePath,
            fileSize:    rec.fileSize,
            durationSec: rec.durationSec || meta?.duration || 0,
            startedAt:   rec.startedAt,
            endedAt:     rec.endedAt,
            createdAt:   rec.createdAt,
            isPublic:    meta?.isPublic ?? false,
            title:       meta?.title || s.title,
            description: meta?.description || null,
            tags:        meta?.tags ? JSON.parse(meta.tags) : [],
            viewCount:   meta?.viewCount ?? 0,
            metaId:      meta?.id || null,
          };
        })
      )
    );

    res.json({ replays });
  } catch (err) {
    console.error('[replays/user]', err);
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
      stream.recordings.map(async (rec) => {
        let meta: any = null;
        try { meta = await prisma.replayMeta.findUnique({ where: { recordingId: rec.id } }); } catch {}
        return {
          ...rec,
          title:    meta?.title || stream.title,
          isPublic: meta?.isPublic ?? false,
          tags:     meta?.tags ? JSON.parse(meta.tags) : [],
          viewCount: meta?.viewCount ?? 0,
          meta,
        };
      })
    );

    res.json({ recordings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stream replays' });
  }
});

// POST /api/replays/:recordingId/meta
router.post('/:recordingId/meta', async (req, res) => {
  try {
    const { hostToken, roomId, title, description, tags, isPublic, thumbnailUrl } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const meta = await prisma.replayMeta.upsert({
      where: { recordingId: req.params.recordingId },
      update: {
        ...(title       !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(tags        !== undefined && { tags: JSON.stringify(tags) }),
        ...(isPublic    !== undefined && { isPublic }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      },
      create: {
        recordingId:  req.params.recordingId,
        title:        title || stream.title,
        description:  description || null,
        tags:         tags ? JSON.stringify(tags) : '[]',
        isPublic:     isPublic ?? false,
        thumbnailUrl: thumbnailUrl || null,
        duration:     0,
      },
    });

    res.json({ meta });
  } catch (err) {
    console.error('[replays/meta]', err);
    res.status(500).json({ error: 'Failed to update replay metadata' });
  }
});

// POST /api/replays/:recordingId/view
router.post('/:recordingId/view', async (req, res) => {
  try {
    await prisma.replayMeta.updateMany({
      where: { recordingId: req.params.recordingId },
      data: { viewCount: { increment: 1 } },
    });
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

export default router;
