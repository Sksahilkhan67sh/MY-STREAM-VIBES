import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/watchlater/:userId
router.get('/:userId', async (req, res) => {
  try {
    const items = await prisma.watchLater.findMany({
      where: { userId: req.params.userId },
      orderBy: { addedAt: 'desc' },
    });
    const streamIds = items.map(i => i.streamId);
    const streams = await prisma.stream.findMany({
      where: { id: { in: streamIds } },
      select: {
        id: true, roomId: true, title: true, thumbnailUrl: true,
        isLive: true, viewerCount: true, scheduledAt: true, createdAt: true,
        category: { select: { name: true, slug: true, icon: true } },
        user: { select: { id: true, name: true, username: true, avatarUrl: true } },
      },
    });
    const map = new Map(streams.map(s => [s.id, s]));
    res.json({ items: streamIds.map(id => map.get(id)).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch watch later' });
  }
});

// POST /api/watchlater
router.post('/', async (req, res) => {
  try {
    const { userId, streamId } = z.object({ userId: z.string(), streamId: z.string() }).parse(req.body);
    await prisma.watchLater.upsert({
      where: { userId_streamId: { userId, streamId } },
      update: {},
      create: { userId, streamId },
    });
    res.json({ saved: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to save' });
  }
});

// DELETE /api/watchlater
router.delete('/', async (req, res) => {
  try {
    const { userId, streamId } = z.object({ userId: z.string(), streamId: z.string() }).parse(req.body);
    await prisma.watchLater.deleteMany({ where: { userId, streamId } });
    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove' });
  }
});

// ── Playlists ─────────────────────────────────────────────────────────────────

// GET /api/watchlater/playlists/:userId
router.get('/playlists/:userId', async (req, res) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { userId: req.params.userId },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

const PlaylistSchema = z.object({
  userId: z.string(), title: z.string().min(1).max(80),
  description: z.string().max(300).optional(), isPublic: z.boolean().optional(),
});

// POST /api/watchlater/playlists
router.post('/playlists', async (req, res) => {
  try {
    const data = PlaylistSchema.parse(req.body);
    const playlist = await prisma.playlist.create({
      data: { userId: data.userId, title: data.title, description: data.description, isPublic: data.isPublic ?? false },
    });
    res.json(playlist);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// POST /api/watchlater/playlists/:id/items
router.post('/playlists/:id/items', async (req, res) => {
  try {
    const { streamId } = z.object({ streamId: z.string() }).parse(req.body);
    const count = await prisma.playlistItem.count({ where: { playlistId: req.params.id } });
    await prisma.playlistItem.upsert({
      where: { playlistId_streamId: { playlistId: req.params.id, streamId } },
      update: {},
      create: { playlistId: req.params.id, streamId, position: count },
    });
    res.json({ added: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to playlist' });
  }
});

// DELETE /api/watchlater/playlists/:id/items/:streamId
router.delete('/playlists/:id/items/:streamId', async (req, res) => {
  try {
    await prisma.playlistItem.deleteMany({
      where: { playlistId: req.params.id, streamId: req.params.streamId },
    });
    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove' });
  }
});

export default router;
