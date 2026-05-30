import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { createHostToken } from '../lib/livekit-server';
import { optionalAuth } from '../lib/auth';

const router = Router();
const prisma = new PrismaClient();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

const CATEGORIES = ['Gaming', 'Coding', 'Education', 'Music', 'Business', 'Art', 'IRL', 'Talk Show'] as const;

const CreateStreamSchema = z.object({
  title: z.string().min(1).max(100),
  password: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  expiresInHours: z.number().min(1).max(168).default(24),
  category: z.string().optional(),
  tags: z.array(z.string().max(30)).max(5).optional(),
});

// ─── POST /api/streams ─────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  try {
    const data = CreateStreamSchema.parse(req.body);
    const roomId = nanoid();
    const hostSecret = nanoid(32);
    const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
    const livekitToken = await createHostToken(roomId, `host-${roomId}`);
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;

    const stream = await prisma.stream.create({
      data: {
        roomId, title: data.title, hostToken: hostSecret, passwordHash, expiresAt,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        category: data.category ?? null,
        tags: data.tags ?? [],
        hostId: req.user?.userId ?? null,
      },
    });

    res.json({ roomId: stream.roomId, hostToken: hostSecret, livekitToken, viewerUrl: `/s/${roomId}`, expiresAt: stream.expiresAt });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    res.status(500).json({ error: 'Failed to create stream' });
  }
});

// ─── GET /api/streams (browse / search) ───────────────────────────
router.get('/', async (req, res) => {
  const { q, category, sort = 'viewers', status, page = '1' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * 20;
  const where: any = { deletedAt: null, expiresAt: { gt: new Date() } };

  if (q) where.title = { contains: q, mode: 'insensitive' };
  if (category) where.category = category;
  if (status === 'live')     where.isLive = true;
  if (status === 'upcoming') where.isLive = false;

  const orderBy: any =
    sort === 'viewers' ? { viewerCount: 'desc' } :
    sort === 'newest'  ? { createdAt: 'desc' }   :
    sort === 'trending' ? { peakViewers: 'desc' } : { createdAt: 'desc' };

  const [streams, total] = await Promise.all([
    prisma.stream.findMany({
      where,
      skip,
      take: 20,
      orderBy,
      select: {
        roomId: true, title: true, isLive: true, viewerCount: true,
        peakViewers: true, category: true, tags: true, scheduledAt: true,
        thumbnailUrl: true, createdAt: true,
        host: { select: { displayName: true, avatarUrl: true } },
      },
    }),
    prisma.stream.count({ where }),
  ]);

  res.json({ streams, total, pages: Math.ceil(total / 20), page: parseInt(page) });
});

// ─── GET /api/streams/categories ──────────────────────────────────
router.get('/categories', (_req, res) => {
  res.json(CATEGORIES);
});

// ─── GET /api/streams/:roomId ──────────────────────────────────────
router.get('/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({
      where: { roomId: req.params.roomId },
      select: {
        roomId: true, title: true, isLive: true, isRecording: true,
        scheduledAt: true, expiresAt: true, viewerCount: true, peakViewers: true,
        passwordHash: true, category: true, tags: true, thumbnailUrl: true,
        host: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (!stream.deletedAt && new Date() > stream.expiresAt) {
      return res.status(410).json({ error: 'Stream link has expired' });
    }
    res.json({ ...stream, hasPassword: !!stream.passwordHash, passwordHash: undefined });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stream' });
  }
});

// ─── PATCH /api/streams/:roomId ────────────────────────────────────
router.patch('/:roomId', async (req, res) => {
  try {
    const { hostToken, isLive, isRecording, title, category, tags } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.stream.update({
      where: { roomId: req.params.roomId },
      data: {
        ...(isLive !== undefined && { isLive }),
        ...(isRecording !== undefined && { isRecording }),
        ...(title && { title }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stream' });
  }
});

// ─── POST /api/streams/:roomId/verify-password ────────────────────
router.post('/:roomId/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (!stream.passwordHash) return res.json({ valid: true });
    const valid = await bcrypt.compare(password, stream.passwordHash);
    res.json({ valid });
  } catch {
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

export default router;
