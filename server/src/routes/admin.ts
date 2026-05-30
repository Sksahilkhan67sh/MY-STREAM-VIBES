import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requireRole } from '../lib/auth';
import { getRedis } from '../lib/redis';

const router = Router();

// All admin routes require ADMIN role
router.use(requireAuth, requireRole('ADMIN'));

// ─── GET /api/admin/stats ─────────────────────────────────────────
router.get('/stats', async (_req, res) => {
  const redis = getRedis();
  const [totalUsers, totalStreams, liveStreams, totalRecordings, recentReports] = await Promise.all([
    prisma.user.count({ where: { bannedAt: null } }),
    prisma.stream.count({ where: { deletedAt: null } }),
    prisma.stream.count({ where: { isLive: true, deletedAt: null } }),
    prisma.recording.count(),
    prisma.report.count({ where: { resolved: false } }),
  ]);

  res.json({ totalUsers, totalStreams, liveStreams, totalRecordings, pendingReports: recentReports });
});

// ─── GET /api/admin/users ─────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { search, page = '1', limit = '20', role, banned } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: any = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (role) where.role = role;
  if (banned === 'true') where.bannedAt = { not: null };
  if (banned === 'false') where.bannedAt = null;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, displayName: true, role: true,
        provider: true, bannedAt: true, createdAt: true, avatarUrl: true,
        _count: { select: { streams: true, followers: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ─── PATCH /api/admin/users/:id ───────────────────────────────────
router.patch('/users/:id', async (req, res) => {
  const { action, role } = req.body as { action: 'ban' | 'unban' | 'set_role'; role?: string };

  try {
    let update: any = {};
    if (action === 'ban')     update = { bannedAt: new Date() };
    if (action === 'unban')   update = { bannedAt: null };
    if (action === 'set_role' && role) update = { role };

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: update,
      select: { id: true, email: true, displayName: true, role: true, bannedAt: true },
    });
    res.json(user);
  } catch {
    res.status(404).json({ error: 'User not found' });
  }
});

// ─── GET /api/admin/streams ───────────────────────────────────────
router.get('/streams', async (req, res) => {
  const { page = '1', limit = '20', live } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: any = { deletedAt: null };
  if (live === 'true') where.isLive = true;

  const [streams, total] = await Promise.all([
    prisma.stream.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        host: { select: { id: true, displayName: true, email: true } },
        _count: { select: { recordings: true, polls: true } },
      },
    }),
    prisma.stream.count({ where }),
  ]);

  res.json({ streams, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ─── DELETE /api/admin/streams/:roomId ───────────────────────────
router.delete('/streams/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    await prisma.stream.update({
      where: { roomId: req.params.roomId },
      data: { deletedAt: new Date(), isLive: false },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete stream' });
  }
});

// ─── GET /api/admin/reports ───────────────────────────────────────
router.get('/reports', async (req, res) => {
  const { resolved = 'false', page = '1' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * 20;

  const where = resolved === 'true' ? { resolved: true } : { resolved: false };
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      skip,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, displayName: true, email: true } },
        stream: { select: { roomId: true, title: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);

  res.json({ reports, total, pages: Math.ceil(total / 20) });
});

// ─── PATCH /api/admin/reports/:id/resolve ────────────────────────
router.patch('/reports/:id/resolve', async (req, res) => {
  await prisma.report.update({ where: { id: req.params.id }, data: { resolved: true } });
  res.json({ success: true });
});

export default router;
